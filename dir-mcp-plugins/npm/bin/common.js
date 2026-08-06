"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_CONFIG = {
  OASF_API_VALIDATION_SCHEMA_URL: "https://schema.oasf.outshift.com",
  DIRECTORY_CLIENT_SERVER_ADDRESS: "0.0.0.0:8888",
  DIRECTORY_CLIENT_AUTH_MODE: "none",
  DIRECTORY_CLIENT_AUTH_TOKEN: "",
  DIRECTORY_MCP_PATH: "",
  DIRECTORY_DIRCTL_PATH: "",
};

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".config", "dir-mcp", "config.json");

const configPath = path.resolve(
  (process.env.DIR_MCP_CONFIG || DEFAULT_CONFIG_PATH).replace(/^~/, os.homedir())
);

// Reads the config file, creating it with DEFAULT_CONFIG values if absent.
// Returns the parsed object, or {} on error.
function loadConfig(log) {
  if (!fs.existsSync(configPath)) {
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf8");
      log(`created default config at ${configPath}`);
    } catch (err) {
      log(`warning: could not create default config at ${configPath}: ${err.message}`);
    }
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") log(`warning: could not read config ${configPath}: ${err.message}`);
    return {};
  }
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
    return path.resolve(env.DIRECTORY_MCP_PATH.replace(/^~/, os.homedir()));
  }
  return path.join(binDir, getMcpServerBinaryName());
}

// Returns the absolute path for the dirctl binary, or null if not found.
// Uses DIRECTORY_DIRCTL_PATH from env if set and non-empty; otherwise looks for
// the bundled binary inside binDir (the npm package's own bin directory).
function resolveDirctlPath(env, binDir) {
  if (env.DIRECTORY_DIRCTL_PATH) {
    return path.resolve(env.DIRECTORY_DIRCTL_PATH.replace(/^~/, os.homedir()));
  }
  const name = getDirctlBinaryName();
  if (!name) return null;
  const bundled = path.join(binDir, name);
  return fs.existsSync(bundled) ? bundled : null;
}

module.exports = {
  DEFAULT_CONFIG,
  configPath,
  loadConfig,
  getMcpServerBinaryName,
  getDirctlBinaryName,
  resolveMcpServerPath,
  resolveDirctlPath,
};
