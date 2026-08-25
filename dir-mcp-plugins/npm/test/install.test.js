"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { run, releaseAssetUrl, DIRCTL_TAG } = require("../bin/install.js");
const { getMcpServerBinaryName, getDirctlBinaryName } = require("../bin/common.js");

// Fake fetch that serves fixed bodies for known URLs and 404s everything else.
function fakeFetch(bodiesByUrl) {
  return async (url) => {
    const body = bodiesByUrl[url];
    if (body === undefined) {
      return { ok: false, status: 404, statusText: "Not Found" };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(body) };
  };
}

describe("releaseAssetUrl", () => {
  it("builds a tagged download URL", () => {
    assert.equal(
      releaseAssetUrl("agntcy/dir-mcp", "v1.3.5", "mcp-server-linux-amd64"),
      "https://github.com/agntcy/dir-mcp/releases/download/v1.3.5/mcp-server-linux-amd64",
    );
  });

  it("builds a latest-alias URL", () => {
    assert.equal(
      releaseAssetUrl("agntcy/dir", "latest", "dirctl-linux-amd64"),
      "https://github.com/agntcy/dir/releases/latest/download/dirctl-linux-amd64",
    );
  });
});

describe("install run()", () => {
  let binDir;
  let logs;
  const log = (msg) => logs.push(msg);

  beforeEach(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), "dmcp-install-"));
    logs = [];
  });

  afterEach(() => {
    fs.rmSync(binDir, { recursive: true, force: true });
  });

  it("skips entirely when DIR_MCP_SKIP_INSTALL is set", async () => {
    process.env.DIR_MCP_SKIP_INSTALL = "1";
    try {
      await run({ binDir, pkg: { version: "1.3.5" }, fetchImpl: fakeFetch({}), log });
    } finally {
      delete process.env.DIR_MCP_SKIP_INSTALL;
    }
    assert.deepEqual(fs.readdirSync(binDir), []);
    assert.ok(logs.some((l) => l.includes("DIR_MCP_SKIP_INSTALL")));
  });

  it("downloads both binaries for the current platform and makes them executable", async (t) => {
    let mcpName;
    let dirctlName;
    try {
      mcpName = getMcpServerBinaryName();
      dirctlName = getDirctlBinaryName();
    } catch {
      t.skip("unsupported platform for binary name resolution");
      return;
    }
    if (!dirctlName) {
      t.skip("no dirctl build for this platform");
      return;
    }

    const mcpUrl = releaseAssetUrl("agntcy/dir-mcp", "v1.3.5", mcpName);
    const dirctlUrl = releaseAssetUrl("agntcy/dir", DIRCTL_TAG, dirctlName);

    await run({
      binDir,
      pkg: { version: "1.3.5" },
      fetchImpl: fakeFetch({ [mcpUrl]: "fake-mcp-binary", [dirctlUrl]: "fake-dirctl-binary" }),
      log,
    });

    const mcpDest = path.join(binDir, mcpName);
    const dirctlDest = path.join(binDir, dirctlName);
    assert.equal(fs.readFileSync(mcpDest, "utf8"), "fake-mcp-binary");
    assert.equal(fs.readFileSync(dirctlDest, "utf8"), "fake-dirctl-binary");
    assert.equal(fs.statSync(mcpDest).mode & 0o755, 0o755);
    assert.equal(fs.statSync(dirctlDest).mode & 0o755, 0o755);

    // No leftover .tmp files.
    for (const f of fs.readdirSync(binDir)) assert.ok(!f.endsWith(".tmp"));
  });

  it("logs a warning and leaves no partial file when the mcp-server download 404s", async (t) => {
    let mcpName;
    try {
      mcpName = getMcpServerBinaryName();
    } catch {
      t.skip("unsupported platform for binary name resolution");
      return;
    }

    await run({
      binDir,
      pkg: { version: "1.3.5" },
      fetchImpl: fakeFetch({}), // everything 404s
      log,
    });

    assert.ok(!fs.existsSync(path.join(binDir, mcpName)));
    assert.ok(logs.some((l) => l.includes("failed to download")));
  });
});
