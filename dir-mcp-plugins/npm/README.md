# @agntcy/dir-mcp

npm package for the [AGNTCY Agent Directory MCP server](https://github.com/agntcy/dir-mcp).

Downloads the platform-specific binary from GitHub Releases on install and exposes it as a runnable command — no Go toolchain required.

## Install

```sh
npm install -g @agntcy/dir-mcp
```

## Usage

### As an MCP server (Claude / Cursor / VS Code)

Add to your MCP config:

```json
{
  "mcpServers": {
    "agntcy-dir": {
      "command": "dir-mcp",
      "env": {
        "OASF_API_VALIDATION_SCHEMA_URL": "https://schema.oasf.outshift.com",
        "DIRECTORY_CLIENT_SERVER_ADDRESS": "0.0.0.0:8888",
        "DIRECTORY_CLIENT_AUTH_MODE": "none"
      }
    }
  }
}
```

Or use `npx` without a global install:

```json
{
  "mcpServers": {
    "agntcy-dir": {
      "command": "npx",
      "args": ["-y", "@agntcy/dir-mcp"],
      "env": {
        "OASF_API_VALIDATION_SCHEMA_URL": "https://schema.oasf.outshift.com",
        "DIRECTORY_CLIENT_SERVER_ADDRESS": "0.0.0.0:8888",
        "DIRECTORY_CLIENT_AUTH_MODE": "none"
      }
    }
  }
}
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OASF_API_VALIDATION_SCHEMA_URL` | Yes | OASF schema server URL |
| `DIRECTORY_CLIENT_SERVER_ADDRESS` | No | Directory server address (default `0.0.0.0:8888`) |
| `DIRECTORY_CLIENT_AUTH_MODE` | No | Auth mode: `none`, `github`, `x509`, `jwt`, `token` |
| `DIRECTORY_CLIENT_AUTH_TOKEN` | No | Pre-issued bearer token for CI/scripts |

## Config file

Instead of setting shell environment variables, create `~/.config/dir-mcp/config.json`:

```json
{
  "DIRECTORY_CLIENT_SERVER_ADDRESS": "0.0.0.0:8888",
  "DIRECTORY_CLIENT_AUTH_MODE": "none",
  "DIRECTORY_CLIENT_AUTH_TOKEN": "your-token"
}
```

The wrapper reads this file on every startup. Process environment variables and `mcp.json` `env` entries take precedence over config file values, so they can still override individual keys.

To use a different path, set `DIR_MCP_CONFIG=/path/to/config.json`.

## Supported platforms

| OS | Architecture |
|----|-------------|
| macOS | arm64, x64 |
| Linux | arm64, x64 |
| Windows | x64 |

## License

Apache-2.0
