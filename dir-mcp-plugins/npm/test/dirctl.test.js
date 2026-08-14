"use strict";

// Tests for bin/dirctl.js.
//
// dirctl.js has two distinct concerns:
//   1. Module exports (getDirctlBinaryName, resolveDirctlPath) — tested inline.
//   2. Process behaviour when invoked as a CLI — tested by spawning child processes.

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WRAPPER = path.resolve(__dirname, "../bin/dirctl.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Spawns the dirctl wrapper with the given env and extra argv, returning
// { code, stdout, stderr } when the process exits.
function runDirctl(env, extraArgs = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [WRAPPER, ...extraArgs], {
      env: { PATH: process.env.PATH, ...env },
      // Use "pipe" so we can capture output even though dirctl uses stdio:"inherit"
      // internally — that inherit is relative to the *wrapper* process's stdio,
      // which are the pipes we open here.
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    if (opts.input != null) proc.stdin.write(opts.input);
    proc.stdin.end();

    const timeoutMs = opts.timeout ?? 5000;
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`dirctl wrapper timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

// Writes a fake dirctl binary (a Node.js script) into dir and returns its path.
function writeFakeBinary(dir, lines) {
  const p = path.join(dir, `fake-dirctl-${Date.now()}`);
  fs.writeFileSync(p, ["#!/usr/bin/env node", '"use strict";', ...lines].join("\n"));
  fs.chmodSync(p, 0o755);
  return p;
}

// Minimal env that redirects the config file to a temp path.
function cfgEnv(tmpDir) {
  return { DIR_MCP_CONFIG: path.join(tmpDir, "config.json") };
}

// ---------------------------------------------------------------------------
// Module export tests
// ---------------------------------------------------------------------------

describe("dirctl.js module exports", () => {
  const mod = require("../bin/dirctl.js");

  it("exports getDirctlBinaryName as a function", () => {
    assert.equal(typeof mod.getDirctlBinaryName, "function");
  });

  it("exports resolveDirctlPath as a function", () => {
    assert.equal(typeof mod.resolveDirctlPath, "function");
  });

  it("getDirctlBinaryName is identical to common.js's implementation", () => {
    const common = require("../bin/common.js");
    assert.equal(mod.getDirctlBinaryName(), common.getDirctlBinaryName());
  });

  it("resolveDirctlPath is identical to common.js's implementation", () => {
    const common = require("../bin/common.js");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dirctl-exp-"));
    try {
      const custom = "/custom/path/dirctl";
      assert.equal(
        mod.resolveDirctlPath({ DIRECTORY_DIRCTL_PATH: custom }, tmpDir),
        common.resolveDirctlPath({ DIRECTORY_DIRCTL_PATH: custom }, tmpDir),
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not execute the CLI code when required as a module", () => {
    // If require.main guard were missing, requiring the module would try to
    // find a binary and call process.exit(1).  The fact that we got here
    // without the process dying proves the guard works.
    assert.ok(true);
  });
});

// ---------------------------------------------------------------------------
// Process-level behaviour
// ---------------------------------------------------------------------------

describe("dirctl.js process behaviour", () => {
  let tmpCfg;
  let tmpBin;

  beforeEach(() => {
    tmpCfg = fs.mkdtempSync(path.join(os.tmpdir(), "dirctl-cfg-"));
    tmpBin = fs.mkdtempSync(path.join(os.tmpdir(), "dirctl-bin-"));
  });

  afterEach(() => {
    fs.rmSync(tmpCfg, { recursive: true, force: true });
    fs.rmSync(tmpBin, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Binary resolution failures
  // -------------------------------------------------------------------------

  describe("binary resolution failures", () => {
    it("exits 1 when DIRECTORY_DIRCTL_PATH points to a non-existent file", async () => {
      const missing = path.join(tmpBin, "no-such-dirctl");
      const { code, stderr } = await runDirctl({
        ...cfgEnv(tmpCfg),
        DIRECTORY_DIRCTL_PATH: missing,
      });

      assert.equal(code, 1);
      // The binary path resolves (DIRECTORY_DIRCTL_PATH is set) but the file
      // doesn't exist, so accessSync + chmodSync both fail.
      assert.ok(
        stderr.includes("chmod failed") || stderr.includes("not executable"),
        `Expected chmod-failure message.\nActual stderr:\n${stderr}`,
      );
    });

    it("error message for missing DIRECTORY_DIRCTL_PATH binary includes the path", async () => {
      const missing = path.join(tmpBin, "no-such-dirctl");
      const { stderr } = await runDirctl({
        ...cfgEnv(tmpCfg),
        DIRECTORY_DIRCTL_PATH: missing,
      });

      assert.ok(
        stderr.includes(missing),
        `Expected missing path in stderr.\nActual stderr:\n${stderr}`,
      );
    });

    it("exits 1 when no dirctl binary is available at all", async (t) => {
      const { getDirctlBinaryName } = require("../bin/common.js");
      const bundled = path.join(__dirname, "../bin", getDirctlBinaryName() ?? "__none__");
      if (fs.existsSync(bundled)) {
        t.skip("bundled dirctl binary is present — not applicable to a published install");
        return;
      }

      // No DIRECTORY_DIRCTL_PATH, no bundled binary → resolveDirctlPath returns null.
      const { code, stderr } = await runDirctl(cfgEnv(tmpCfg));

      assert.equal(code, 1);
      assert.ok(
        stderr.includes("dirctl binary not found"),
        `Expected "dirctl binary not found" in stderr.\nActual stderr:\n${stderr}`,
      );
    });

    it("uses [dirctl] prefix for its own log messages", async () => {
      const missing = path.join(tmpBin, "no-such-dirctl");
      const { stderr } = await runDirctl({
        ...cfgEnv(tmpCfg),
        DIRECTORY_DIRCTL_PATH: missing,
      });

      assert.ok(
        stderr.includes("[dirctl]"),
        `Expected [dirctl] prefix in stderr.\nActual stderr:\n${stderr}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Exit code forwarding
  // -------------------------------------------------------------------------

  describe("exit code forwarding", () => {
    it("forwards exit code 0 from the dirctl binary", async () => {
      const bin = writeFakeBinary(tmpBin, ["process.exit(0);"]);
      const { code } = await runDirctl({
        ...cfgEnv(tmpCfg),
        DIRECTORY_DIRCTL_PATH: bin,
      });

      assert.equal(code, 0);
    });

    it("forwards a non-zero exit code from the dirctl binary", async () => {
      const bin = writeFakeBinary(tmpBin, ["process.exit(7);"]);
      const { code } = await runDirctl({
        ...cfgEnv(tmpCfg),
        DIRECTORY_DIRCTL_PATH: bin,
      });

      assert.equal(code, 7);
    });

    it("forwards exit code 1 (common failure case)", async () => {
      const bin = writeFakeBinary(tmpBin, ["process.exit(1);"]);
      const { code } = await runDirctl({
        ...cfgEnv(tmpCfg),
        DIRECTORY_DIRCTL_PATH: bin,
      });

      assert.equal(code, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Argument passthrough
  // -------------------------------------------------------------------------

  describe("argument passthrough", () => {
    it("passes extra arguments to the dirctl binary", async () => {
      const bin = writeFakeBinary(tmpBin, [
        "process.stdout.write(JSON.stringify(process.argv.slice(2)) + \"\\n\");",
        "process.exit(0);",
      ]);

      const { code, stdout } = await runDirctl(
        { ...cfgEnv(tmpCfg), DIRECTORY_DIRCTL_PATH: bin },
        ["auth", "login", "--flag"],
      );

      assert.equal(code, 0);
      const args = JSON.parse(stdout.trim());
      assert.deepEqual(args, ["auth", "login", "--flag"]);
    });

    it("passes no extra arguments when none are given", async () => {
      const bin = writeFakeBinary(tmpBin, [
        "process.stdout.write(JSON.stringify(process.argv.slice(2)) + \"\\n\");",
        "process.exit(0);",
      ]);

      const { code, stdout } = await runDirctl({
        ...cfgEnv(tmpCfg),
        DIRECTORY_DIRCTL_PATH: bin,
      });

      assert.equal(code, 0);
      assert.deepEqual(JSON.parse(stdout.trim()), []);
    });

    it("passes arguments with spaces correctly", async () => {
      const bin = writeFakeBinary(tmpBin, [
        "process.stdout.write(JSON.stringify(process.argv.slice(2)) + \"\\n\");",
        "process.exit(0);",
      ]);

      const { code, stdout } = await runDirctl(
        { ...cfgEnv(tmpCfg), DIRECTORY_DIRCTL_PATH: bin },
        ["record push", "--name", "my agent"],
      );

      assert.equal(code, 0);
      const args = JSON.parse(stdout.trim());
      assert.deepEqual(args, ["record push", "--name", "my agent"]);
    });
  });

  // -------------------------------------------------------------------------
  // Environment propagation
  // -------------------------------------------------------------------------

  describe("environment propagation", () => {
    it("sets DIRECTORY_DIRCTL_PATH in the binary's environment", async () => {
      const bin = writeFakeBinary(tmpBin, [
        "const v = process.env.DIRECTORY_DIRCTL_PATH || \"\";",
        "process.stdout.write(JSON.stringify({ v }) + \"\\n\");",
        "process.exit(0);",
      ]);

      const { code, stdout } = await runDirctl({
        ...cfgEnv(tmpCfg),
        DIRECTORY_DIRCTL_PATH: bin,
      });

      assert.equal(code, 0);
      const { v } = JSON.parse(stdout.trim());
      assert.equal(v, bin);
    });

    it("merges config file values into the binary's environment", async () => {
      const configFile = path.join(tmpCfg, "config.json");
      fs.mkdirSync(tmpCfg, { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify({
        OASF_API_VALIDATION_SCHEMA_URL: "https://cfg-dirctl.example.com",
        DIRECTORY_CLIENT_SERVER_ADDRESS: "0.0.0.0:8888",
        DIRECTORY_CLIENT_AUTH_MODE: "none",
        DIRECTORY_CLIENT_AUTH_TOKEN: "",
        DIRECTORY_MCP_PATH: "",
        DIRECTORY_DIRCTL_PATH: "",
      }));

      const bin = writeFakeBinary(tmpBin, [
        "const v = process.env.OASF_API_VALIDATION_SCHEMA_URL || \"\";",
        "process.stdout.write(JSON.stringify({ v }) + \"\\n\");",
        "process.exit(0);",
      ]);

      const { code, stdout } = await runDirctl({
        DIR_MCP_CONFIG: configFile,
        DIRECTORY_DIRCTL_PATH: bin,
      });

      assert.equal(code, 0);
      const { v } = JSON.parse(stdout.trim());
      assert.equal(v, "https://cfg-dirctl.example.com");
    });

    it("process.env overrides config file values in the binary's environment", async () => {
      const configFile = path.join(tmpCfg, "config.json");
      fs.mkdirSync(tmpCfg, { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify({
        DIRECTORY_CLIENT_AUTH_MODE: "none",
        DIRECTORY_MCP_PATH: "",
        DIRECTORY_DIRCTL_PATH: "",
      }));

      const bin = writeFakeBinary(tmpBin, [
        "const v = process.env.DIRECTORY_CLIENT_AUTH_MODE || \"\";",
        "process.stdout.write(JSON.stringify({ v }) + \"\\n\");",
        "process.exit(0);",
      ]);

      const { code, stdout } = await runDirctl({
        DIR_MCP_CONFIG: configFile,
        DIRECTORY_DIRCTL_PATH: bin,
        DIRECTORY_CLIENT_AUTH_MODE: "token",  // env overrides config
      });

      assert.equal(code, 0);
      const { v } = JSON.parse(stdout.trim());
      assert.equal(v, "token");
    });
  });

  // -------------------------------------------------------------------------
  // stdio passthrough
  // -------------------------------------------------------------------------

  describe("stdio passthrough", () => {
    it("binary stdout appears on wrapper stdout (stdio:inherit)", async () => {
      // dirctl uses stdio:'inherit', so the binary's stdout IS the wrapper's stdout.
      const bin = writeFakeBinary(tmpBin, [
        "process.stdout.write(\"direct output\\n\");",
        "process.exit(0);",
      ]);

      const { code, stdout } = await runDirctl({
        ...cfgEnv(tmpCfg),
        DIRECTORY_DIRCTL_PATH: bin,
      });

      assert.equal(code, 0);
      assert.ok(stdout.includes("direct output"),
        `Expected direct output on stdout.\nActual stdout:\n${stdout}`);
    });

    it("binary stderr appears on wrapper stderr (stdio:inherit)", async () => {
      const bin = writeFakeBinary(tmpBin, [
        "process.stderr.write(\"error from binary\\n\");",
        "process.exit(0);",
      ]);

      const { code, stderr } = await runDirctl({
        ...cfgEnv(tmpCfg),
        DIRECTORY_DIRCTL_PATH: bin,
      });

      assert.equal(code, 0);
      assert.ok(stderr.includes("error from binary"),
        `Expected binary stderr on wrapper stderr.\nActual stderr:\n${stderr}`);
    });
  });
});
