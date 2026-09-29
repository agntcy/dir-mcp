"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

// In-memory default for the one setting that's dir-mcp's own concern. Which
// directory server to talk to, and how to authenticate against it, is set via
// plain DIRECTORY_CLIENT_* env vars read directly by the mcp-server binary —
// dir-mcp keeps no config file of its own for those and doesn't interpret or
// default them itself. (The bundled dirctl binary has its own, separate
// config with named contexts, but the mcp-server binary does not read it —
// see the README.)
const DEFAULT_ENV = {
  OASF_API_VALIDATION_SCHEMA_URL: "https://schema.oasf.outshift.com",
};

// Expands a leading `~` and any `$HOME`/`${HOME}` reference to the user's home
// directory. MCP client configs (e.g. mcp.json `env` blocks) set env vars
// directly without going through a shell, so `$HOME` is never expanded by the
// OS the way it would be in a shell script — we have to do it ourselves.
function expandHome(p) {
  return p.replace(/^~/, os.homedir()).replace(/\$\{HOME\}|\$HOME/g, os.homedir());
}

// Returns the effective environment: process.env layered over DEFAULT_ENV, so
// explicit env vars (from the shell or an MCP client's `env` block) always win.
function resolveEnv() {
  return { ...DEFAULT_ENV, ...process.env };
}

// Returns the platform-specific mcp-server binary name.
// Throws on unsupported platforms.
function getMcpServerBinaryName() {
  const { platform, arch } = process;
  if (platform === "darwin") return arch === "arm64" ? "mcp-server-darwin-arm64" : "mcp-server-darwin-amd64";
  if (platform === "linux") return arch === "arm64" ? "mcp-server-linux-arm64" : "mcp-server-linux-amd64";
  if (platform === "win32") return "mcp-server-windows-amd64.exe";
  throw new Error(
    `Unsupported platform: ${platform}/${arch}. ` +
    "Supported: darwin/arm64, darwin/x64, linux/arm64, linux/x64, win32/x64."
  );
}

// Returns the platform-specific dirctl binary name, or null on unsupported platforms.
function getDirctlBinaryName() {
  const { platform, arch } = process;
  if (platform === "darwin") return arch === "arm64" ? "dirctl-darwin-arm64" : "dirctl-darwin-amd64";
  if (platform === "linux") return arch === "arm64" ? "dirctl-linux-arm64" : "dirctl-linux-amd64";
  if (platform === "win32") return "dirctl-windows-amd64";
  return null;
}

// Returns the absolute path for the mcp-server binary.
// Uses DIRECTORY_MCP_PATH from env if set and non-empty; otherwise returns the
// bundled binary path inside binDir (the npm package's own bin directory).
// Note: the returned path may not exist yet if the binary hasn't been downloaded.
function resolveMcpServerPath(env, binDir) {
  if (env.DIRECTORY_MCP_PATH) {
    return path.resolve(expandHome(env.DIRECTORY_MCP_PATH));
  }
  return path.join(binDir, getMcpServerBinaryName());
}

// Returns the absolute path for the dirctl binary, or null if not found.
// Uses DIRECTORY_DIRCTL_PATH from env if set and non-empty; otherwise looks for
// the bundled binary inside binDir (the npm package's own bin directory).
function resolveDirctlPath(env, binDir) {
  if (env.DIRECTORY_DIRCTL_PATH) {
    return path.resolve(expandHome(env.DIRECTORY_DIRCTL_PATH));
  }
  const name = getDirctlBinaryName();
  if (!name) return null;
  const bundled = path.join(binDir, name);
  return fs.existsSync(bundled) ? bundled : null;
}

module.exports = {
  DEFAULT_ENV,
  expandHome,
  resolveEnv,
  getMcpServerBinaryName,
  getDirctlBinaryName,
  resolveMcpServerPath,
  resolveDirctlPath,
};
