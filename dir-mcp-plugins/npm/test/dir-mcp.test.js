"use strict";

// Process-level integration tests for bin/dir-mcp.js.
//
// Because dir-mcp.js runs start() at the bottom of the file (no exports),
// every test spawns it as a child process and communicates over stdio/env.
// A fake binary is created per-test so we can control exactly what the
// "mcp-server" process does without needing a real build.

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WRAPPER = path.resolve(__dirname, "../bin/dir-mcp.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Spawns the wrapper with a controlled environment and returns a Promise that
// resolves with { code, stdout, stderr } when the process exits.
function runWrapper(env, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [WRAPPER], {
      // Pass only PATH so the test env doesn't leak into config resolution.
      env: { PATH: process.env.PATH, ...env },
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
      reject(new Error(`Wrapper process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

// Writes a one-liner Node.js script as a fake mcp-server binary in dir and
// returns its absolute path.
function writeFakeBinary(dir, lines) {
  const name = `fake-mcp-${Date.now()}`;
  const p = path.join(dir, name);
  fs.writeFileSync(p, ["#!/usr/bin/env node", '"use strict";', ...lines].join("\n"));
  fs.chmodSync(p, 0o755);
  return p;
}

// Minimal env that routes the config file to a temp directory so tests never
// touch ~/.config/dir-mcp/.
function cfgEnv(tmpDir) {
  return { DIR_MCP_CONFIG: path.join(tmpDir, "config.json") };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

describe("dir-mcp.js", () => {
  let tmpCfg;  // temp dir for config
  let tmpBin;  // temp dir for fake binaries

  beforeEach(() => {
    tmpCfg = fs.mkdtempSync(path.join(os.tmpdir(), "dmcp-cfg-"));
    tmpBin = fs.mkdtempSync(path.join(os.tmpdir(), "dmcp-bin-"));
    // Pre-create the config file so loadConfig() never writes to the watched
    // directory during the test run.  Without this, the config.json creation
    // fires a delayed FSEvents notification that triggers a spurious
    // config-reload restart, which then swallows the binary's exit code and
    // hangs the process.
    fs.writeFileSync(path.join(tmpCfg, "config.json"), JSON.stringify({
      OASF_API_VALIDATION_SCHEMA_URL: "https://schema.oasf.outshift.com",
      DIRECTORY_CLIENT_SERVER_ADDRESS: "0.0.0.0:8888",
      DIRECTORY_CLIENT_AUTH_MODE: "none",
      DIRECTORY_CLIENT_AUTH_TOKEN: "",
      DIRECTORY_MCP_PATH: "",
      DIRECTORY_DIRCTL_PATH: "",
    }, null, 2));
  });

  afterEach(() => {
    fs.rmSync(tmpCfg, { recursive: true, force: true });
    fs.rmSync(tmpBin, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Binary resolution
  // -------------------------------------------------------------------------

  describe("binary resolution", () => {
    it("exits 1 and logs an error when DIRECTORY_MCP_PATH points to a missing file", async () => {
      const missing = path.join(tmpBin, "no-such-server");
      const { code, stderr } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: missing,
      });

      assert.equal(code, 1);
      assert.ok(
        stderr.includes("binary not found at configured DIRECTORY_MCP_PATH"),
        `Expected "binary not found" message in stderr.\nActual stderr:\n${stderr}`,
      );
    });

    it("error message includes the resolved path", async () => {
      const missing = path.join(tmpBin, "no-such-server");
      const { stderr } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: missing,
      });

      assert.ok(
        stderr.includes(missing),
        `Expected resolved path "${missing}" in stderr.\nActual stderr:\n${stderr}`,
      );
    });

    it("automatically sets the executable bit and runs successfully when binary is not executable", async () => {
      const binaryPath = writeFakeBinary(tmpBin, ["process.exit(0);"]);
      // Remove execute bit so the wrapper has to chmod it.
      fs.chmodSync(binaryPath, 0o644);

      const { code } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
      });

      // The wrapper should have chmoded the file and run it successfully.
      assert.equal(code, 0);
    });

    it("exits 1 when no bundled binary is present and DIRECTORY_MCP_PATH is unset", async (t) => {
      const { getMcpServerBinaryName } = require("../bin/common.js");
      const bundled = path.join(__dirname, "../bin", getMcpServerBinaryName());
      if (fs.existsSync(bundled)) {
        t.skip("bundled binary is present — not applicable to a published install");
        return;
      }

      // No DIRECTORY_MCP_PATH set, no bundled binary → wrapper must error.
      const { code, stderr } = await runWrapper(cfgEnv(tmpCfg));

      assert.equal(code, 1);
      assert.ok(
        stderr.includes("binary not found"),
        `Expected "binary not found" in stderr.\nActual stderr:\n${stderr}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // stdout / stderr routing
  // -------------------------------------------------------------------------

  describe("output routing", () => {
    it("forwards JSON lines from binary stdout to wrapper stdout unchanged", async () => {
      const binaryPath = writeFakeBinary(tmpBin, [
        'process.stdout.write(\'{"jsonrpc":"2.0","id":1,"result":{}}\' + "\\n");',
        "process.exit(0);",
      ]);

      const { code, stdout } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
      });

      assert.equal(code, 0);
      assert.ok(
        stdout.includes('{"jsonrpc":"2.0","id":1,"result":{}}'),
        `Expected JSON line on stdout.\nActual stdout:\n${stdout}`,
      );
    });

    it("redirects non-JSON binary stdout lines to stderr with [dir-mcp-server] prefix", async () => {
      const binaryPath = writeFakeBinary(tmpBin, [
        'process.stdout.write("starting up\\n");',
        "process.exit(0);",
      ]);

      const { code, stderr } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
      });

      assert.equal(code, 0);
      assert.ok(
        stderr.includes("[dir-mcp-server] starting up"),
        `Expected prefixed log on stderr.\nActual stderr:\n${stderr}`,
      );
    });

    it("non-JSON binary stdout does not appear on wrapper stdout", async () => {
      const binaryPath = writeFakeBinary(tmpBin, [
        'process.stdout.write("plain log line\\n");',
        "process.exit(0);",
      ]);

      const { stdout } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
      });

      assert.equal(stdout, "", `stdout should be empty.\nActual stdout:\n${stdout}`);
    });

    it("forwards binary stderr to wrapper stderr with [dir-mcp-server] prefix", async () => {
      const binaryPath = writeFakeBinary(tmpBin, [
        'process.stderr.write("internal binary error\\n");',
        "process.exit(0);",
      ]);

      const { code, stderr } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
      });

      assert.equal(code, 0);
      assert.ok(
        stderr.includes("[dir-mcp-server] internal binary error"),
        `Expected prefixed stderr.\nActual stderr:\n${stderr}`,
      );
    });

    it("forwards multiple JSON lines in order", async () => {
      const binaryPath = writeFakeBinary(tmpBin, [
        'process.stdout.write(\'{"id":1}\' + "\\n");',
        'process.stdout.write(\'{"id":2}\' + "\\n");',
        'process.stdout.write(\'{"id":3}\' + "\\n");',
        "process.exit(0);",
      ]);

      const { stdout } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
      });

      const lines = stdout.trim().split("\n");
      assert.deepEqual(lines, ['{"id":1}', '{"id":2}', '{"id":3}']);
    });

    it("handles a mix of JSON and non-JSON lines correctly", async () => {
      const binaryPath = writeFakeBinary(tmpBin, [
        'process.stdout.write(\'{"id":1}\' + "\\n");',
        'process.stdout.write("log line\\n");',
        'process.stdout.write(\'{"id":2}\' + "\\n");',
        "process.exit(0);",
      ]);

      const { stdout, stderr } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
      });

      // JSON lines forwarded to stdout
      assert.ok(stdout.includes('{"id":1}') && stdout.includes('{"id":2}'),
        `Both JSON lines should be on stdout.\nActual stdout:\n${stdout}`);
      // Non-JSON line redirected to stderr
      assert.ok(stderr.includes("[dir-mcp-server] log line"),
        `Non-JSON line should be on stderr.\nActual stderr:\n${stderr}`);
      // Non-JSON line must NOT appear on stdout
      assert.ok(!stdout.includes("log line"),
        `Non-JSON line must not appear on stdout.\nActual stdout:\n${stdout}`);
    });
  });

  // -------------------------------------------------------------------------
  // Exit code forwarding
  // -------------------------------------------------------------------------

  describe("exit code forwarding", () => {
    it("forwards exit code 0 from the binary", async () => {
      const binaryPath = writeFakeBinary(tmpBin, ["process.exit(0);"]);

      const { code } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
      });

      assert.equal(code, 0);
    });

    it("forwards a non-zero exit code from the binary", async () => {
      const binaryPath = writeFakeBinary(tmpBin, ["process.exit(42);"]);

      const { code } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
      });

      assert.equal(code, 42);
    });
  });

  // -------------------------------------------------------------------------
  // Stdin passthrough
  // -------------------------------------------------------------------------

  describe("stdin passthrough", () => {
    it("forwards stdin to the binary", async () => {
      // The fake binary reads one stdin line, echoes it as a JSON message, exits.
      const binaryPath = writeFakeBinary(tmpBin, [
        'let buf = "";',
        'process.stdin.on("data", (d) => { buf += d.toString(); });',
        'process.stdin.on("end", () => {',
        '  const line = buf.split("\\n")[0].replace(/[^a-z0-9 ]/gi, "");',
        '  process.stdout.write(JSON.stringify({ echo: line }) + "\\n");',
        '  process.exit(0);',
        '});',
      ]);

      const { code, stdout } = await runWrapper(
        { ...cfgEnv(tmpCfg), DIRECTORY_MCP_PATH: binaryPath },
        { input: "hello from stdin\n" },
      );

      assert.equal(code, 0);
      const msg = JSON.parse(stdout.trim());
      assert.equal(msg.echo, "hello from stdin");
    });

    it("saves and can replay the MCP initialize request", async () => {
      // The fake binary reads stdin until EOF and outputs what it received as JSON.
      const binaryPath = writeFakeBinary(tmpBin, [
        'const chunks = [];',
        'process.stdin.on("data", (d) => chunks.push(d.toString()));',
        'process.stdin.on("end", () => {',
        '  const text = chunks.join("").trim();',
        '  process.stdout.write(JSON.stringify({ received: text }) + "\\n");',
        '  process.exit(0);',
        '});',
      ]);

      const initRequest = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });

      const { code, stdout } = await runWrapper(
        { ...cfgEnv(tmpCfg), DIRECTORY_MCP_PATH: binaryPath },
        { input: initRequest + "\n" },
      );

      assert.equal(code, 0);
      const msg = JSON.parse(stdout.trim());
      assert.ok(msg.received.includes("initialize"),
        `Binary should have received the initialize request.\nGot: ${msg.received}`);
    });
  });

  // -------------------------------------------------------------------------
  // Environment propagation
  // -------------------------------------------------------------------------

  describe("environment propagation", () => {
    it("sets DIRECTORY_MCP_PATH in the binary's environment to the resolved binary path", async () => {
      const binaryPath = writeFakeBinary(tmpBin, [
        'process.stdout.write(JSON.stringify({ v: process.env.DIRECTORY_MCP_PATH || "" }) + "\\n");',
        "process.exit(0);",
      ]);

      const { code, stdout } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
      });

      assert.equal(code, 0);
      const { v } = JSON.parse(stdout.trim());
      assert.equal(v, binaryPath);
    });

    it("merges config file values into the binary's environment", async () => {
      const configFile = path.join(tmpCfg, "config.json");
      fs.mkdirSync(tmpCfg, { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify({
        OASF_API_VALIDATION_SCHEMA_URL: "https://custom.example.com",
        DIRECTORY_CLIENT_SERVER_ADDRESS: "0.0.0.0:8888",
        DIRECTORY_CLIENT_AUTH_MODE: "none",
        DIRECTORY_CLIENT_AUTH_TOKEN: "",
        DIRECTORY_MCP_PATH: "",
        DIRECTORY_DIRCTL_PATH: "",
      }));

      const binaryPath = writeFakeBinary(tmpBin, [
        'const v = process.env.OASF_API_VALIDATION_SCHEMA_URL || "";',
        'process.stdout.write(JSON.stringify({ v }) + "\\n");',
        "process.exit(0);",
      ]);

      const { code, stdout } = await runWrapper({
        DIR_MCP_CONFIG: configFile,
        DIRECTORY_MCP_PATH: binaryPath,
      });

      assert.equal(code, 0);
      const { v } = JSON.parse(stdout.trim());
      assert.equal(v, "https://custom.example.com");
    });

    it("process.env values override config file values in the binary's environment", async () => {
      const configFile = path.join(tmpCfg, "config.json");
      fs.mkdirSync(tmpCfg, { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify({
        OASF_API_VALIDATION_SCHEMA_URL: "https://config-value.example.com",
        DIRECTORY_MCP_PATH: "",
      }));

      const binaryPath = writeFakeBinary(tmpBin, [
        'const v = process.env.OASF_API_VALIDATION_SCHEMA_URL || "";',
        'process.stdout.write(JSON.stringify({ v }) + "\\n");',
        "process.exit(0);",
      ]);

      const { code, stdout } = await runWrapper({
        DIR_MCP_CONFIG: configFile,
        DIRECTORY_MCP_PATH: binaryPath,
        // This env var overrides the config file value.
        OASF_API_VALIDATION_SCHEMA_URL: "https://env-override.example.com",
      });

      assert.equal(code, 0);
      const { v } = JSON.parse(stdout.trim());
      assert.equal(v, "https://env-override.example.com");
    });

    it("sets DIRECTORY_DIRCTL_PATH in the binary's env when dirctl is found", async () => {
      // Create a fake dirctl binary alongside the mcp-server binary so
      // resolveDirctlPath finds it when DIRECTORY_DIRCTL_PATH is set.
      const dirctlPath = path.join(tmpBin, "fake-dirctl");
      fs.writeFileSync(dirctlPath, "#!/usr/bin/env node\nprocess.exit(0);");
      fs.chmodSync(dirctlPath, 0o755);

      const binaryPath = writeFakeBinary(tmpBin, [
        'const env = {',
        '  DIRECTORY_DIRCTL_PATH: process.env.DIRECTORY_DIRCTL_PATH || "",',
        '};',
        'process.stdout.write(JSON.stringify(env) + "\\n");',
        "process.exit(0);",
      ]);

      const { code, stdout } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: binaryPath,
        DIRECTORY_DIRCTL_PATH: dirctlPath,
      });

      assert.equal(code, 0);
      const env = JSON.parse(stdout.trim());
      assert.equal(env.DIRECTORY_DIRCTL_PATH, dirctlPath);
    });
  });

  // -------------------------------------------------------------------------
  // Wrapper self-logging
  // -------------------------------------------------------------------------

  describe("wrapper log prefix", () => {
    it("uses [dir-mcp] prefix for its own log messages", async () => {
      const missing = path.join(tmpBin, "no-such-server");
      const { stderr } = await runWrapper({
        ...cfgEnv(tmpCfg),
        DIRECTORY_MCP_PATH: missing,
      });

      assert.ok(
        stderr.includes("[dir-mcp]"),
        `Expected [dir-mcp] prefix in wrapper logs.\nActual stderr:\n${stderr}`,
      );
    });
  });
});
