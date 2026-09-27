"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

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

// ─── expandHome ──────────────────────────────────────────────────────────────

describe("expandHome", () => {
  const { expandHome } = require("../bin/common.js");

  it("expands a leading ~", () => {
    assert.equal(expandHome("~/config.json"), path.join(os.homedir(), "config.json"));
  });

  it("expands $HOME", () => {
    assert.equal(expandHome("$HOME/config.json"), path.join(os.homedir(), "config.json"));
  });

  it("expands ${HOME}", () => {
    assert.equal(expandHome("${HOME}/config.json"), path.join(os.homedir(), "config.json"));
  });

  it("leaves a plain absolute path untouched", () => {
    assert.equal(expandHome("/etc/example/binary"), "/etc/example/binary");
  });
});

// ─── resolveEnv / DEFAULT_ENV ────────────────────────────────────────────────
//
// dir-mcp keeps no config file of its own — which directory server/instance
// to talk to and how to authenticate is entirely dirctl's job (its own
// `~/.config/dirctl/config.yaml` contexts and `dirctl context` command).
// resolveEnv only layers a small in-memory default (the OASF schema URL)
// under whatever the process/MCP-client env already provides.

describe("DEFAULT_ENV", () => {
  const { DEFAULT_ENV } = require("../bin/common.js");

  it("defaults to the public OASF schema URL", () => {
    assert.equal(DEFAULT_ENV.OASF_API_VALIDATION_SCHEMA_URL, "https://schema.oasf.outshift.com");
  });

  it("does not carry any directory-server/instance fields — that's dirctl's job", () => {
    for (const key of ["DIRECTORY_CLIENT_SERVER_ADDRESS", "DIRECTORY_CLIENT_AUTH_MODE", "DIRECTORY_CLIENT_AUTH_TOKEN"]) {
      assert.ok(!(key in DEFAULT_ENV), `DEFAULT_ENV should not contain ${key}`);
    }
  });
});

describe("resolveEnv", () => {
  it("applies the OASF schema URL default when unset", () => {
    const key = require.resolve("../bin/common.js");
    delete require.cache[key];
    const orig = process.env.OASF_API_VALIDATION_SCHEMA_URL;
    delete process.env.OASF_API_VALIDATION_SCHEMA_URL;
    try {
      const { resolveEnv } = require("../bin/common.js");
      assert.equal(resolveEnv().OASF_API_VALIDATION_SCHEMA_URL, "https://schema.oasf.outshift.com");
    } finally {
      if (orig === undefined) delete process.env.OASF_API_VALIDATION_SCHEMA_URL;
      else process.env.OASF_API_VALIDATION_SCHEMA_URL = orig;
    }
  });

  it("lets process.env override the default", () => {
    const orig = process.env.OASF_API_VALIDATION_SCHEMA_URL;
    process.env.OASF_API_VALIDATION_SCHEMA_URL = "https://custom.example.com";
    try {
      const { resolveEnv } = require("../bin/common.js");
      assert.equal(resolveEnv().OASF_API_VALIDATION_SCHEMA_URL, "https://custom.example.com");
    } finally {
      if (orig === undefined) delete process.env.OASF_API_VALIDATION_SCHEMA_URL;
      else process.env.OASF_API_VALIDATION_SCHEMA_URL = orig;
    }
  });

  it("passes through directory-server env vars untouched, for the mcp-server binary or dirctl to interpret", () => {
    const orig = process.env.DIRECTORY_CLIENT_SERVER_ADDRESS;
    process.env.DIRECTORY_CLIENT_SERVER_ADDRESS = "staging.example.com:443";
    try {
      const { resolveEnv } = require("../bin/common.js");
      assert.equal(resolveEnv().DIRECTORY_CLIENT_SERVER_ADDRESS, "staging.example.com:443");
    } finally {
      if (orig === undefined) delete process.env.DIRECTORY_CLIENT_SERVER_ADDRESS;
      else process.env.DIRECTORY_CLIENT_SERVER_ADDRESS = orig;
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

  it("expands $HOME in DIRECTORY_MCP_PATH", () => {
    const result = resolveMcpServerPath(
      { DIRECTORY_MCP_PATH: "$HOME/bin/mcp-server" },
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

  it("expands $HOME in DIRECTORY_DIRCTL_PATH", () => {
    const result = resolveDirctlPath(
      { DIRECTORY_DIRCTL_PATH: "$HOME/bin/dirctl" },
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
