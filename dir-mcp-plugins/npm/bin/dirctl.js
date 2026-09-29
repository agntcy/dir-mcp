#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const { resolveEnv, getDirctlBinaryName, resolveDirctlPath } = require("./common");

const DEBUG = !!process.env.DIR_MCP_DEBUG;
const log = (msg) => process.stderr.write(`[dirctl] ${msg}\n`);
const debug = (msg) => { if (DEBUG) log(msg); };

if (require.main === module) {
  const env = resolveEnv();

  const binaryPath = resolveDirctlPath(env, __dirname);
  debug(`resolved dirctl: ${binaryPath}`);

  if (!binaryPath) {
    log(
      env.DIRECTORY_DIRCTL_PATH
        ? `binary not found at configured DIRECTORY_DIRCTL_PATH: ${env.DIRECTORY_DIRCTL_PATH}`
        : "dirctl binary not found — reinstall the npm package to restore it"
    );
    process.exit(1);
  }

  try {
    fs.accessSync(binaryPath, fs.constants.X_OK);
  } catch {
    try {
      fs.chmodSync(binaryPath, 0o755);
    } catch (err) {
      log(`dirctl binary is not executable and chmod failed — ${err.message}`);
      process.exit(1);
    }
  }

  debug(`args: ${JSON.stringify(process.argv.slice(2))}`);

  const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: "inherit",
    env: { ...env, DIRECTORY_DIRCTL_PATH: binaryPath },
  });

  child.on("error", (err) => {
    log(`failed to run dirctl — ${err.message}`);
    process.exit(1);
  });

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
}

module.exports = { getDirctlBinaryName, resolveDirctlPath };
