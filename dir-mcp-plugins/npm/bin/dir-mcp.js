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
  const dirctlPath = resolveDirctlPath(env, __dirname);
  if (dirctlPath) {
    env.DIRECTORY_DIRCTL_PATH = dirctlPath;
    debug(`resolved dirctl: ${dirctlPath}`);
  } else {
    debug(`bundled dirctl not found — DIRECTORY_DIRCTL_PATH not set`);
  }

  return { env, binaryPath };
}

let child = null;
let restarting = false;
let isConfigReloadChild = false;

// The MCP client performs the `initialize` handshake exactly once per
// session and never repeats it just because we swapped the backend process
// out from under it on a config-reload restart. So we intercept the client's
// stdin ourselves, remember that handshake, and replay it to a freshly
// spawned child before letting the client's own traffic back through —
// otherwise the new child rejects everything as "invalid during session
// initialization".
let cachedInitialize = null;
let cachedInitializeId = null;
let cachedInitialized = null;
let replaySwallowId = null;
let childReady = false;
let handshakeReplayTimer = null;
let pendingClientLines = [];
let pendingEnd = false;

function writeToChild(line) {
  if (!childReady || !child || !child.stdin.writable) {
    pendingClientLines.push(line);
    return;
  }
  child.stdin.write(line + "\n");
}

// Client stdin EOF (e.g. the MCP client tearing down the session) must reach
// the child too, or it hangs forever waiting for more input.
function endChildStdin() {
  if (!childReady || !child || !child.stdin.writable) {
    pendingEnd = true;
    return;
  }
  child.stdin.end();
}

function handleClientLine(line) {
  try {
    const msg = JSON.parse(line);
    if (msg.method === "initialize" && cachedInitialize === null) {
      cachedInitialize = line;
      cachedInitializeId = msg.id;
    } else if (msg.method === "notifications/initialized" && cachedInitialized === null) {
      cachedInitialized = line;
    }
  } catch {
    // not a JSON-RPC line — forward as-is
  }
  writeToChild(line);
}

// A restarted child is only ready for real client traffic once the replayed
// handshake (if any) has run its course.
function finishHandshakeReplay() {
  if (handshakeReplayTimer) {
    clearTimeout(handshakeReplayTimer);
    handshakeReplayTimer = null;
  }
  replaySwallowId = null;
  childReady = true;
  for (const line of pendingClientLines.splice(0)) writeToChild(line);
  if (pendingEnd) {
    pendingEnd = false;
    endChildStdin();
  }
}

let clientStdinBuf = "";
process.stdin.on("data", (chunk) => {
  clientStdinBuf += chunk.toString();
  const lines = clientStdinBuf.split("\n");
  clientStdinBuf = lines.pop();
  for (const line of lines) {
    if (line) handleClientLine(line);
  }
});

process.stdin.on("end", () => {
  if (clientStdinBuf) {
    handleClientLine(clientStdinBuf);
    clientStdinBuf = "";
  }
  endChildStdin();
});

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
  childReady = false;
  debug(`spawning binary with args: ${JSON.stringify(process.argv.slice(2))}`);
  child = spawn(binaryPath, process.argv.slice(2), {
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });

  child.stdin.on("error", (err) => debug(`child stdin error: ${err.message}`));

  if (fromConfigReload && cachedInitialize) {
    replaySwallowId = cachedInitializeId;
    debug(`replaying cached initialize handshake to restarted binary`);
    child.stdin.write(cachedInitialize + "\n");
    handshakeReplayTimer = setTimeout(() => {
      log(`restarted binary did not respond to replayed initialize — resuming anyway`);
      finishHandshakeReplay();
    }, 10000);
  } else {
    childReady = true;
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
        if (replaySwallowId !== null) {
          let msg;
          try { msg = JSON.parse(line); } catch { msg = null; }
          if (msg && msg.id === replaySwallowId) {
            // Response to our replayed `initialize` — the real client already
            // got its own response the first time, so don't forward this one.
            if (cachedInitialized) child.stdin.write(cachedInitialized + "\n");
            finishHandshakeReplay();
            continue;
          }
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
    if (handshakeReplayTimer) {
      clearTimeout(handshakeReplayTimer);
      handshakeReplayTimer = null;
    }
    replaySwallowId = null;
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
    if (handshakeReplayTimer) {
      clearTimeout(handshakeReplayTimer);
      handshakeReplayTimer = null;
    }
    replaySwallowId = null;
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

  const initial = resolveEnv(true);
  spawnChild(initial.env, initial.binaryPath);

  // Start watching only after binaries are ready and the server is spawned.
  // This prevents the config.json creation during loadConfig from triggering
  // a spurious restart before the download completes.
  watchConfig();
}

start();
