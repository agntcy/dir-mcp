#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  configPath,
  loadConfig,
  getMcpServerBinaryName,
  resolveMcpServerPath,
  resolveDirctlPath,
} = require("./common");

const DEBUG = !!process.env.DIR_MCP_DEBUG;
const log = (msg) => process.stderr.write(`[dir-mcp] ${msg}\n`);
const debug = (msg) => { if (DEBUG) log(msg); };

try {
  getMcpServerBinaryName();
  debug(`detected platform=${process.platform} arch=${process.arch}`);
} catch (err) {
  log(err.message);
  process.exit(1);
}

// Returns { env, binaryPath } on success, null on unrecoverable error.
// fatal=true causes process.exit on initial startup; on restart, returns
// null so the old child stays running.
function resolveEnv(fatal) {
  const config = loadConfig(log);
  const env = { ...config, ...process.env };
  debug(`config path: ${configPath}`);
  debug(`config keys applied: ${Object.keys(config).join(", ") || "none"}`);

  // Resolve MCP server binary: config/env value wins; fall back to the bundled binary.
  const binaryPath = resolveMcpServerPath(env, __dirname);
  debug(`resolved MCP binary path: ${binaryPath}`);

  if (!fs.existsSync(binaryPath)) {
    if (env.DIRECTORY_MCP_PATH) {
      log(`binary not found at configured DIRECTORY_MCP_PATH: ${binaryPath}`);
    } else {
      log(
        `binary not found at ${binaryPath} — reinstall the npm package, ` +
        `or set DIRECTORY_MCP_PATH in ${configPath}`
      );
    }
    if (fatal) process.exit(1);
    return null;
  }

  try {
    fs.accessSync(binaryPath, fs.constants.X_OK);
    debug(`binary is executable`);
  } catch {
    try {
      fs.chmodSync(binaryPath, 0o755);
      debug(`set executable bit on ${binaryPath}`);
    } catch (err) {
      log(`binary is not executable and chmod failed — ${err.message}`);
      if (fatal) process.exit(1);
      return null;
    }
  }

  env.DIRECTORY_MCP_PATH = binaryPath;

  // Resolve DIRECTORY_DIRCTL_PATH via shared helper (config/env wins, then bundled).
  // Also expose DIRCTL as a convenience alias so skills and rules can use $DIRCTL directly.
  const dirctlPath = resolveDirctlPath(env, __dirname);
  if (dirctlPath) {
    env.DIRECTORY_DIRCTL_PATH = dirctlPath;
    env.DIRCTL = dirctlPath;
    debug(`resolved dirctl: ${dirctlPath}`);
  } else {
    debug(`bundled dirctl not found — DIRECTORY_DIRCTL_PATH and DIRCTL not set`);
  }

  return { env, binaryPath };
}

let child = null;
let restarting = false;
let isConfigReloadChild = false;

// MCP initialization replay — when the server binary restarts (OIDC login,
// config reload) the MCP client (Cursor) has already completed the
// initialize/initialized handshake and will not re-send it.  We intercept
// stdin to save those two messages and replay them to every new child so
// the binary transitions to its ready state before tool calls arrive.
// The replayed initialize response is suppressed so Cursor never sees a
// duplicate.
let savedInitRequest = null;      // raw JSON line of the "initialize" request
let savedInitRequestId = null;    // id field of that request, for suppression
let savedInitNotification = null; // raw JSON line of "notifications/initialized"
let suppressInitResponse = false; // drop the next initialize response from child

function writeToChild(line) {
  if (child && child.stdin && child.exitCode === null) {
    try { child.stdin.write(line + "\n"); } catch {}
  }
}

function setupStdin() {
  let buf = "";
  process.stdin.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.method === "initialize" && "id" in msg) {
          savedInitRequest = line;
          savedInitRequestId = msg.id;
        } else if (msg.method === "notifications/initialized") {
          savedInitNotification = line;
        }
      } catch {}
      writeToChild(line);
    }
  });
  process.stdin.on("end", () => {
    if (child && child.stdin) child.stdin.end();
  });
}

function replayInitToChild(stdin) {
  if (savedInitRequest) {
    stdin.write(savedInitRequest + "\n");
    suppressInitResponse = true;
  }
  if (savedInitNotification) {
    stdin.write(savedInitNotification + "\n");
  }
}

// Runs `dirctl auth login`, forwarding its output to stderr, and resolves when
// it exits successfully. Rejects on non-zero exit or spawn error.
function runOidcLogin(env) {
  const dirctlPath = env.DIRECTORY_DIRCTL_PATH;
  if (!dirctlPath) {
    return Promise.reject(new Error("dirctl binary not found — cannot run OIDC login"));
  }

  log(`OIDC access token required — launching \`dirctl auth login\`...`);

  return new Promise((resolve, reject) => {
    const loginProc = spawn(dirctlPath, ["auth", "login"], {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    loginProc.stdout.on("data", (chunk) => {
      for (const line of chunk.toString().split("\n")) {
        if (line) process.stderr.write(`[dirctl] ${line}\n`);
      }
    });

    loginProc.stderr.on("data", (chunk) => {
      for (const line of chunk.toString().split("\n")) {
        if (line) process.stderr.write(`[dirctl] ${line}\n`);
      }
    });

    loginProc.on("error", (err) => reject(new Error(`dirctl auth login: ${err.message}`)));

    loginProc.on("close", (code) => {
      if (code === 0) {
        log(`OIDC login successful — restarting MCP server`);
        resolve();
      } else {
        reject(new Error(`dirctl auth login exited with code ${code}`));
      }
    });
  });
}

// fromConfigReload=true when the child is spawned by watchConfig after a live
// config change. On failure these children do not exit the wrapper — the user
// can fix the config and trigger another restart.
function spawnChild(env, binaryPath, fromConfigReload = false) {
  isConfigReloadChild = fromConfigReload;
  debug(`spawning binary with args: ${JSON.stringify(process.argv.slice(2))}`);
  child = spawn(binaryPath, process.argv.slice(2), {
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });

  // Replay the MCP initialize/initialized handshake so the new binary reaches
  // its ready state before the MCP client sends tool calls.
  if (savedInitRequest) {
    replayInitToChild(child.stdin);
  }

  // stdout is the MCP JSON-RPC channel. Buffer line by line: forward JSON lines
  // to stdout, redirect anything else (e.g. stray Go log output) to stderr so
  // it never corrupts the JSON-RPC stream seen by the MCP client.
  // Also detect the OIDC "no access token" error so we can trigger login.
  let stdoutBuf = "";
  let needsOidcLogin = false;
  child.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop(); // keep the incomplete trailing fragment
    for (const line of lines) {
      if (DEBUG) process.stderr.write(`[dir-mcp-server stdout] ${line}\n`);
      if (line.trimStart().startsWith("{")) {
        // Suppress the initialize response replayed to the restarted child —
        // Cursor already received this response from the first run.
        if (suppressInitResponse) {
          try {
            const msg = JSON.parse(line);
            if ("id" in msg && msg.id === savedInitRequestId && !("method" in msg)) {
              suppressInitResponse = false;
              debug(`suppressed replayed initialize response (id=${savedInitRequestId})`);
              continue;
            }
          } catch {}
        }
        process.stdout.write(line + "\n");
      } else if (line) {
        if (line.includes("no OIDC access token")) needsOidcLogin = true;
        process.stderr.write(`[dir-mcp-server] ${line}\n`);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line) process.stderr.write(`[dir-mcp-server] ${line}\n`);
    }
  });

  child.on("error", (err) => {
    log(`failed to run binary — ${err.message}`);
    if (!restarting) {
      if (isConfigReloadChild) {
        log(`restarted binary failed — fix the config to retry`);
        child = null;
      } else {
        process.exit(1);
      }
    }
  });

  child.on("close", (code, signal) => {
    debug(`binary exited with status=${code} signal=${signal}`);
    if (restarting) return;

    if (needsOidcLogin) {
      child = null;
      runOidcLogin(env)
        .then(() => spawnChild(env, binaryPath, isConfigReloadChild))
        .catch((err) => {
          log(`OIDC login failed — ${err.message}`);
          if (!isConfigReloadChild) process.exit(1);
        });
      return;
    }

    if (isConfigReloadChild && code !== 0) {
      log(`restarted binary exited with error (status=${code}) — fix the config to retry`);
      child = null;
    } else {
      process.exit(code ?? 0);
    }
  });
}

function watchConfig() {
  // Watch the config file's parent directory — more reliable than watching the
  // file directly since editors often replace it atomically (new inode).
  let debounceTimer = null;

  fs.watch(path.dirname(configPath), (event, filename) => {
    if (filename !== path.basename(configPath)) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      log(`config changed, restarting MCP server`);

      const next = resolveEnv(false);
      if (!next) {
        log(`restart aborted — could not resolve binary from updated config`);
        return;
      }

      restarting = true;
      const restart = () => {
        restarting = false;
        spawnChild(next.env, next.binaryPath, true);
      };

      if (child && child.exitCode === null) {
        child.once("close", restart);
        child.kill();
      } else {
        restart();
      }
    }, 300);
  });
}

function start() {
  // Create the config dir before watching so fs.watch never sees ENOENT.
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  loadConfig(log);

  setupStdin();

  const initial = resolveEnv(true);
  spawnChild(initial.env, initial.binaryPath);

  // Start watching only after binaries are ready and the server is spawned.
  // This prevents the config.json creation during loadConfig from triggering
  // a spurious restart before the download completes.
  watchConfig();
}

start();
