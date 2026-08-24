#!/usr/bin/env node
"use strict";

// postinstall: downloads the two binaries this platform needs (mcp-server,
// dirctl) from GitHub Releases straight into bin/, instead of shipping all
// five platforms' binaries inside the npm tarball.

const fs = require("fs");
const path = require("path");
const { getMcpServerBinaryName, getDirctlBinaryName } = require("./common");

const MCP_REPO = "agntcy/dir-mcp";
const DIRCTL_REPO = "agntcy/dir";

// Pinned dirctl release tag to fetch. Set to "latest" to track the latest
// release of agntcy/dir instead of a fixed version.
const DIRCTL_TAG = "latest";

const log = (msg) => process.stderr.write(`[dir-mcp install] ${msg}\n`);

// Downloads url to destPath (via a .tmp sibling, renamed on success so a
// failed download never leaves a partial binary behind). Returns true on
// success, false on a "not found"/network failure that install() should
// tolerate.
async function downloadTo(url, destPath, fetchImpl) {
  const res = await fetchImpl(url, { redirect: "follow" });
  if (!res.ok) {
    log(`GET ${url} -> ${res.status} ${res.statusText}`);
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpPath = `${destPath}.tmp`;
  fs.writeFileSync(tmpPath, buf);
  fs.chmodSync(tmpPath, 0o755);
  fs.renameSync(tmpPath, destPath);
  return true;
}

function releaseAssetUrl(repo, tag, assetName) {
  return tag === "latest"
    ? `https://github.com/${repo}/releases/latest/download/${assetName}`
    : `https://github.com/${repo}/releases/download/${tag}/${assetName}`;
}

async function run({ binDir, pkg, fetchImpl, log: logFn }) {
  if (process.env.DIR_MCP_SKIP_INSTALL) {
    logFn("DIR_MCP_SKIP_INSTALL set — skipping binary download");
    return;
  }

  let mcpName;
  let dirctlName;
  try {
    mcpName = getMcpServerBinaryName();
    dirctlName = getDirctlBinaryName();
  } catch (err) {
    logFn(
      `${err.message} — skipping binary download. ` +
      "Set DIRECTORY_MCP_PATH (and optionally DIRECTORY_DIRCTL_PATH) to use a binary you provide yourself."
    );
    return;
  }

  const mcpVersion = `v1.3.5`;
  const mcpUrl = releaseAssetUrl(MCP_REPO, mcpVersion, mcpName);
  const mcpDest = path.join(binDir, mcpName);
  logFn(`downloading ${mcpName} from ${mcpVersion}...`);
  try {
    const ok = await downloadTo(mcpUrl, mcpDest, fetchImpl);
    if (!ok) {
      logFn(
        `failed to download ${mcpName} — set DIRECTORY_MCP_PATH to a binary you provide yourself, ` +
        "or re-run install once network/release access is available."
      );
    }
  } catch (err) {
    logFn(`failed to download ${mcpName}: ${err.message}`);
  }

  if (!dirctlName) return; // no dirctl build for this platform; not fatal.

  const dirctlUrl = releaseAssetUrl(DIRCTL_REPO, DIRCTL_TAG, dirctlName);
  const dirctlDest = path.join(binDir, dirctlName);
  logFn(`downloading ${dirctlName} from ${DIRCTL_REPO}@${DIRCTL_TAG}...`);
  try {
    const ok = await downloadTo(dirctlUrl, dirctlDest, fetchImpl);
    if (!ok) {
      logFn(`failed to download ${dirctlName} — dirctl-dependent features (e.g. OIDC login) will be unavailable.`);
    }
  } catch (err) {
    logFn(`failed to download ${dirctlName}: ${err.message}`);
  }
}

if (require.main === module) {
  const pkg = require("../package.json");
  run({ binDir: __dirname, pkg, fetchImpl: fetch, log }).catch((err) => {
    // Never fail `npm install` over a download hiccup — DIRECTORY_MCP_PATH
    // remains available as a manual escape hatch.
    log(`unexpected error: ${err.message}`);
  });
}

module.exports = { run, releaseAssetUrl, DIRCTL_TAG };
