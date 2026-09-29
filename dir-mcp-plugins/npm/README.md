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
      "command": "dir-mcp"
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
      "args": ["-y", "@agntcy/dir-mcp"]
    }
  }
}
```

### Which directory server to talk to

`dir-mcp` keeps no connection config of its own — the MCP server binary reads
`DIRECTORY_CLIENT_*` environment variables directly (server address, auth
mode, TLS, OIDC, tokens). Set them in the `env` block above:

```json
{
  "mcpServers": {
    "agntcy-dir": {
      "command": "dir-mcp",
      "env": {
        "DIRECTORY_CLIENT_SERVER_ADDRESS": "0.0.0.0:8888",
        "DIRECTORY_CLIENT_AUTH_MODE": "none"
      }
    }
  }
}
```

**Note:** this only configures the MCP server's own tool calls. The bundled
`dirctl` binary (this package's second CLI entry point) is a separate program
with its own connection settings — it does **not** read the MCP server's env
block, and the MCP server does **not** read `dirctl`'s config. If you invoke
`dirctl` directly (e.g. `dirctl auth login`, or ad hoc `dirctl search`/`pull`),
it resolves its target server from its own config file,
`~/.config/dirctl/config.yaml`, which supports multiple named **contexts** —
the same way `kubectl` owns cluster contexts:

```yaml
current_context: my-directory
contexts:
  my-directory:
    server_address: 0.0.0.0:8888
    auth_mode: none
  staging:
    server_address: staging.example.com:443
    auth_mode: oidc
    oidc_issuer: https://idp.example.com
    oidc_client_id: dirctl
```

Switch between contexts with:

```sh
dirctl context list
dirctl context set staging
```

See `dirctl context --help` for the full set of subcommands (`list`,
`current`, `set`, `show`, `validate`). `DIRECTORY_CLIENT_*` env vars, if set,
still override `dirctl`'s selected context for that invocation — so if you
set them in the MCP server's `env` block, both the MCP server and any direct
`dirctl` invocation you make with the same environment will target the same
directory, without needing a context at all.

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OASF_API_VALIDATION_SCHEMA_URL` | No | OASF schema server URL (defaults to the public AGNTCY schema server) |
| `DIRECTORY_CLIENT_SERVER_ADDRESS` | No | Directory server address |
| `DIRECTORY_CLIENT_AUTH_MODE` | No | Auth mode: `none`, `token`, `oidc`, `x509`, `jwt`, `tls` |
| `DIRECTORY_CLIENT_AUTH_TOKEN` | No | Pre-issued bearer token for CI/scripts |
| `DIRECTORY_CLIENT_OIDC_ISSUER` / `DIRECTORY_CLIENT_OIDC_CLIENT_ID` | No | OIDC issuer/client ID (for `oidc` mode) |

## Dependencies installation

`npm install` runs a postinstall step that downloads the two binaries this
platform needs (`mcp-server`, `dirctl`) from GitHub Releases. If you already
have the binaries, you can set these environment variables instead:

- Set `DIR_MCP_SKIP_INSTALL=1` to skip the download during `npm install`.
- Point `DIRECTORY_MCP_PATH` (and optionally `DIRECTORY_DIRCTL_PATH`) at
  binaries you've placed yourself.

A leading `~` or a `$HOME`/`${HOME}` reference in either path is expanded to
the user's home directory — useful since MCP client configs (e.g. `mcp.json`
`env` blocks) set environment variables directly, without a shell to expand
them.

## Supported platforms

| OS | Architecture |
|----|-------------|
| macOS | arm64, x64 |
| Linux | arm64, x64 |
| Windows | x64 |

## License

Apache-2.0
