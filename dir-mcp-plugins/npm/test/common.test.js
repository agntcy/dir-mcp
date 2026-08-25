"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Reload common.js with DIR_MCP_CONFIG pointing at a given path, bypassing the
// module cache so each test gets a fresh configPath binding.
function freshRequireCommon(configFilePath) {
  const key = require.resolve("../bin/common.js");
  delete require.cache[key];
  const orig = process.env.DIR_MCP_CONFIG;
  process.env.DIR_MCP_CONFIG = configFilePath;
  try {
    return require("../bin/common.js");
  } finally {
    if (orig === undefined) delete process.env.DIR_MCP_CONFIG;
    else process.env.DIR_MCP_CONFIG = orig;
  }
}

// ─── getMcpServerBinaryName ──────────────────────────────────────────────────

describe("getMcpServerBinaryName", () => {
  // Expected names indexed by [platform][arch].
  const EXPECTED = {
    darwin: { arm64: "mcp-server-darwin-arm64", x64: "mcp-server-darwin-amd64" },
    linux:  { arm64: "mcp-server-linux-arm64",  x64: "mcp-server-linux-amd64"  },
    win32:  { x64:   "mcp-server-windows-amd64.exe" },
  };

  it("returns the correct binary name for the current platform/arch", () => {
    const { getMcpServerBinaryName } = require("../bin/common.js");
    const expected = (EXPECTED[process.platform] || {})[process.arch];
    if (expected) {
      assert.equal(getMcpServerBinaryName(), expected);
    } else {
      // The current platform is not a supported one; the function should throw.
      assert.throws(() => getMcpServerBinaryName(), /Unsupported platform/);
    }
  });

  it("name always starts with 'mcp-server-' on supported platforms", () => {
    const { getMcpServerBinaryName } = require("../bin/common.js");
    if (EXPECTED[process.platform]) {
      assert.ok(getMcpServerBinaryName().startsWith("mcp-server-"));
    }
  });

  it("all expected names follow the mcp-server-<os>-<arch> pattern", () => {
    // Validate the lookup table itself matches the documented naming scheme.
    for (const [plat, arches] of Object.entries(EXPECTED)) {
      for (const [arch, name] of Object.entries(arches)) {
        assert.match(name, /^mcp-server-(darwin|linux|windows)-(arm64|amd64)(\.exe)?$/,
          `Unexpected name for ${plat}/${arch}: ${name}`);
      }
    }
  });
});

// ─── getDirctlBinaryName ─────────────────────────────────────────────────────

describe("getDirctlBinaryName", () => {
  const EXPECTED = {
    darwin: { arm64: "dirctl-darwin-arm64", x64: "dirctl-darwin-amd64" },
    linux:  { arm64: "dirctl-linux-arm64",  x64: "dirctl-linux-amd64"  },
    win32:  { x64:   "dirctl-windows-amd64" },
  };

  it("returns the correct binary name for the current platform/arch", () => {
    const { getDirctlBinaryName } = require("../bin/common.js");
    const expected = (EXPECTED[process.platform] || {})[process.arch];
    if (expected !== undefined) {
      assert.equal(getDirctlBinaryName(), expected);
    } else {
      // Unsupported: function returns null (never throws).
      assert.equal(getDirctlBinaryName(), null);
    }
  });

  it("returns null (not throws) on an unsupported platform", () => {
    // Verify the contract: getDirctlBinaryName never throws.
    // We can't mock process.platform, so we verify the function never throws
    // regardless of the current platform.
    const { getDirctlBinaryName } = require("../bin/common.js");
    assert.doesNotThrow(() => getDirctlBinaryName());
  });

  it("all expected names follow the dirctl-<os>-<arch> pattern", () => {
    for (const [plat, arches] of Object.entries(EXPECTED)) {
      for (const [arch, name] of Object.entries(arches)) {
        assert.match(name, /^dirctl-(darwin|linux|windows)-(arm64|amd64)$/,
          `Unexpected name for ${plat}/${arch}: ${name}`);
      }
    }
  });
});

// ─── resolveMcpServerPath ────────────────────────────────────────────────────

describe("resolveMcpServerPath", () => {
  const { resolveMcpServerPath, getMcpServerBinaryName } = require("../bin/common.js");
  const BIN_DIR = "/usr/local/lib/node_modules/@agntcy/dir-mcp/bin";

  it("uses DIRECTORY_MCP_PATH from env when set", () => {
    const result = resolveMcpServerPath(
      { DIRECTORY_MCP_PATH: "/custom/path/mcp-server" },
      BIN_DIR,
    );
    assert.equal(result, "/custom/path/mcp-server");
  });

  it("expands ~ in DIRECTORY_MCP_PATH", () => {
    const result = resolveMcpServerPath(
      { DIRECTORY_MCP_PATH: "~/bin/mcp-server" },
      BIN_DIR,
    );
    assert.equal(result, path.join(os.homedir(), "bin", "mcp-server"));
  });

  it("falls back to bundled binary inside binDir when DIRECTORY_MCP_PATH is absent", () => {
    const result = resolveMcpServerPath({}, BIN_DIR);
    assert.equal(result, path.join(BIN_DIR, getMcpServerBinaryName()));
  });

  it("falls back to bundled binary when DIRECTORY_MCP_PATH is an empty string", () => {
    const result = resolveMcpServerPath({ DIRECTORY_MCP_PATH: "" }, BIN_DIR);
    assert.equal(result, path.join(BIN_DIR, getMcpServerBinaryName()));
  });

  it("resolves a relative DIRECTORY_MCP_PATH to an absolute path", () => {
    const result = resolveMcpServerPath(
      { DIRECTORY_MCP_PATH: "./bin/mcp-server" },
      BIN_DIR,
    );
    assert.ok(path.isAbsolute(result));
    assert.ok(result.endsWith("bin/mcp-server"));
  });
});

// ─── resolveDirctlPath ───────────────────────────────────────────────────────

describe("resolveDirctlPath", () => {
  const { resolveDirctlPath, getDirctlBinaryName } = require("../bin/common.js");
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dir-mcp-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses DIRECTORY_DIRCTL_PATH from env when set", () => {
    const custom = path.join(tmpDir, "my-dirctl");
    const result = resolveDirctlPath({ DIRECTORY_DIRCTL_PATH: custom }, tmpDir);
    assert.equal(result, custom);
  });

  it("expands ~ in DIRECTORY_DIRCTL_PATH", () => {
    const result = resolveDirctlPath(
      { DIRECTORY_DIRCTL_PATH: "~/bin/dirctl" },
      tmpDir,
    );
    assert.equal(result, path.join(os.homedir(), "bin", "dirctl"));
  });

  it("returns the bundled binary path when it exists", () => {
    const name = getDirctlBinaryName();
    if (!name) return; // skip on unsupported platform

    const bundled = path.join(tmpDir, name);
    fs.writeFileSync(bundled, "");

    const result = resolveDirctlPath({}, tmpDir);
    assert.equal(result, bundled);
  });

  it("returns null when the bundled binary does not exist", () => {
    const name = getDirctlBinaryName();
    if (!name) return; // skip on unsupported platform

    // tmpDir is empty — bundled binary absent
    const result = resolveDirctlPath({}, tmpDir);
    assert.equal(result, null);
  });

  it("returns null when DIRECTORY_DIRCTL_PATH is empty and platform has no binary name", () => {
    // When getDirctlBinaryName returns null (unsupported platform), the result
    // must also be null — regardless of what's in binDir.
    if (getDirctlBinaryName() !== null) return; // skip on supported platforms

    const result = resolveDirctlPath({}, tmpDir);
    assert.equal(result, null);
  });
});

// ─── loadConfig ──────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  let tmpDir;
  let tmpConfig;
  const noop = () => {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dir-mcp-cfg-test-"));
    tmpConfig = path.join(tmpDir, "config.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Evict common.js from cache so the next test gets a fresh configPath.
    const key = require.resolve("../bin/common.js");
    delete require.cache[key];
  });

  it("creates a default config file when none exists and returns the defaults", () => {
    const { loadConfig, DEFAULT_CONFIG } = freshRequireCommon(tmpConfig);

    assert.ok(!fs.existsSync(tmpConfig), "pre-condition: file must not exist yet");

    const cfg = loadConfig(noop);

    assert.ok(fs.existsSync(tmpConfig), "config file was not created");
    assert.deepEqual(cfg, DEFAULT_CONFIG);
  });

  it("writes a valid JSON file with all DEFAULT_CONFIG keys", () => {
    const { loadConfig, DEFAULT_CONFIG } = freshRequireCommon(tmpConfig);
    loadConfig(noop);

    const written = JSON.parse(fs.readFileSync(tmpConfig, "utf8"));
    assert.deepEqual(Object.keys(written).sort(), Object.keys(DEFAULT_CONFIG).sort());
  });

  it("reads and returns an existing config file unchanged", () => {
    const custom = {
      OASF_API_VALIDATION_SCHEMA_URL: "https://my-schema.example.com",
      DIRECTORY_CLIENT_SERVER_ADDRESS: "127.0.0.1:9999",
      DIRECTORY_CLIENT_AUTH_MODE: "token",
      DIRECTORY_CLIENT_AUTH_TOKEN: "secret",
      DIRECTORY_MCP_PATH: "/opt/mcp-server",
      DIRECTORY_DIRCTL_PATH: "/opt/dirctl",
    };
    fs.writeFileSync(tmpConfig, JSON.stringify(custom), "utf8");

    const { loadConfig } = freshRequireCommon(tmpConfig);
    const cfg = loadConfig(noop);

    assert.deepEqual(cfg, custom);
  });

  it("does not overwrite an existing config file", () => {
    const original = { MY_CUSTOM_KEY: "preserved" };
    fs.writeFileSync(tmpConfig, JSON.stringify(original), "utf8");

    const { loadConfig } = freshRequireCommon(tmpConfig);
    loadConfig(noop);

    const after = JSON.parse(fs.readFileSync(tmpConfig, "utf8"));
    assert.deepEqual(after, original);
  });

  it("returns {} when the config file contains invalid JSON", () => {
    fs.writeFileSync(tmpConfig, "not { json }", "utf8");

    const { loadConfig } = freshRequireCommon(tmpConfig);
    const cfg = loadConfig(noop);

    assert.deepEqual(cfg, {});
  });

  it("returns {} when the config file is empty", () => {
    fs.writeFileSync(tmpConfig, "", "utf8");

    const { loadConfig } = freshRequireCommon(tmpConfig);
    const cfg = loadConfig(noop);

    assert.deepEqual(cfg, {});
  });

  it("calls the log function when creating the default config", () => {
    const { loadConfig } = freshRequireCommon(tmpConfig);
    const messages = [];
    loadConfig((msg) => messages.push(msg));

    assert.ok(messages.some((m) => m.includes("created default config")),
      `Expected a "created default config" log; got: ${JSON.stringify(messages)}`);
  });

  it("calls the log function with a warning when config contains invalid JSON", () => {
    fs.writeFileSync(tmpConfig, "{ bad json", "utf8");

    const { loadConfig } = freshRequireCommon(tmpConfig);
    const messages = [];
    loadConfig((msg) => messages.push(msg));

    assert.ok(messages.some((m) => m.includes("warning")),
      `Expected a warning log; got: ${JSON.stringify(messages)}`);
  });

  it("returns a partial config when the file contains only some keys", () => {
    const partial = { OASF_API_VALIDATION_SCHEMA_URL: "https://partial.example.com" };
    fs.writeFileSync(tmpConfig, JSON.stringify(partial), "utf8");

    const { loadConfig } = freshRequireCommon(tmpConfig);
    const cfg = loadConfig(noop);

    assert.equal(cfg.OASF_API_VALIDATION_SCHEMA_URL, "https://partial.example.com");
    assert.equal(Object.keys(cfg).length, 1);
  });
});

// ─── DEFAULT_CONFIG ──────────────────────────────────────────────────────────

describe("DEFAULT_CONFIG", () => {
  const { DEFAULT_CONFIG } = require("../bin/common.js");

  it("contains all required keys", () => {
    const requiredKeys = [
      "OASF_API_VALIDATION_SCHEMA_URL",
      "DIRECTORY_CLIENT_SERVER_ADDRESS",
      "DIRECTORY_CLIENT_AUTH_MODE",
      "DIRECTORY_CLIENT_AUTH_TOKEN",
      "DIRECTORY_MCP_PATH",
      "DIRECTORY_DIRCTL_PATH",
    ];
    for (const key of requiredKeys) {
      assert.ok(key in DEFAULT_CONFIG, `Missing key: ${key}`);
    }
  });

  it("defaults to the public OASF schema URL", () => {
    assert.equal(
      DEFAULT_CONFIG.OASF_API_VALIDATION_SCHEMA_URL,
      "https://schema.oasf.outshift.com",
    );
  });

  it("defaults auth mode to 'none'", () => {
    assert.equal(DEFAULT_CONFIG.DIRECTORY_CLIENT_AUTH_MODE, "none");
  });

  it("defaults binary override paths to empty strings", () => {
    assert.equal(DEFAULT_CONFIG.DIRECTORY_MCP_PATH, "");
    assert.equal(DEFAULT_CONFIG.DIRECTORY_DIRCTL_PATH, "");
  });
});
