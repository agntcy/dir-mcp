#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const {
  resolveEnv,
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

// Resolves the environment and binary paths to launch mcp-server with.
// Exits the process on unrecoverable errors (missing/non-executable binary).
function resolveLaunch() {
  const env = resolveEnv();

  // Resolve MCP server binary: env value wins; fall back to the bundled binary.
  const binaryPath = resolveMcpServerPath(env, __dirname);
  debug(`resolved MCP binary path: ${binaryPath}`);

  if (!fs.existsSync(binaryPath)) {
    if (env.DIRECTORY_MCP_PATH) {
      log(`binary not found at configured DIRECTORY_MCP_PATH: ${binaryPath}`);
    } else {
      log(`binary not found at ${binaryPath} — reinstall the npm package, or set DIRECTORY_MCP_PATH`);
    }
    process.exit(1);
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
      process.exit(1);
    }
  }

  env.DIRECTORY_MCP_PATH = binaryPath;

  // Resolve DIRECTORY_DIRCTL_PATH via shared helper (env wins, then bundled).
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
let pendingChunks = [];
let pendingEnd = false;

process.stdin.on("data", (chunk) => {
  if (child && child.stdin.writable) {
    child.stdin.write(chunk);
  } else {
    pendingChunks.push(chunk);
  }
});
process.stdin.on("end", () => {
  if (child && child.stdin.writable) {
    child.stdin.end();
  } else {
    pendingEnd = true;
  }
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

function spawnChild(env, binaryPath) {
  debug(`spawning binary with args: ${JSON.stringify(process.argv.slice(2))}`);
  child = spawn(binaryPath, process.argv.slice(2), {
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });

  child.stdin.on("error", (err) => debug(`child stdin error: ${err.message}`));

  for (const chunk of pendingChunks.splice(0)) child.stdin.write(chunk);
  if (pendingEnd) {
    pendingEnd = false;
    child.stdin.end();
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
    process.exit(1);
  });

  child.on("close", (code, signal) => {
    debug(`binary exited with status=${code} signal=${signal}`);

    if (needsOidcLogin) {
      child = null;
      runOidcLogin(env)
        .then(() => spawnChild(env, binaryPath))
        .catch((err) => {
          log(`OIDC login failed — ${err.message}`);
          process.exit(1);
        });
      return;
    }

    process.exit(code ?? 0);
  });
}

function start() {
  const { env, binaryPath } = resolveLaunch();
  spawnChild(env, binaryPath);
}

start();
