---
name: configure-dir-mcp
description: View and update how dir-mcp connects to a Directory server through chat to set the server address, authentication mode, and other runtime options. Use when the user asks to configure dir-mcp, change the server address, set an auth token, switch auth mode, configure OIDC or TLS, or update the OASF schema URL.
---

# Configure dir-mcp

dir-mcp keeps no config file of its own. Two independent things can be configured, and it's important not to conflate them:

1. **The MCP server's own directory connection** — used by every `agntcy_dir_*`/`agntcy_oasf_*` tool call. Set via `DIRECTORY_CLIENT_*` environment variables in `.mcp.json`'s `env` block. This is what to edit when the user asks to "configure dir-mcp".
2. **The bundled `dirctl` CLI's own target server** — used only when `dirctl` itself is invoked directly (e.g. by the `dirctl-auth` or `search-agents` skills). It has a separate config file with named contexts at `~/.config/dirctl/config.yaml`. `DIRECTORY_CLIENT_*` env vars, if set, override `dirctl`'s selected context too — so setting them once in `.mcp.json`'s `env` block keeps both in sync automatically. `dirctl` contexts are only useful as an extra convenience for switching directories across plain terminal invocations of `dirctl` outside of Claude Code.

This skill covers (1), the MCP server's own connection. See the `dirctl-auth` skill if you specifically need to manage `dirctl` contexts.

## 1. Find the MCP config file

```sh
cat .mcp.json
```

Locate the `agntcy-dir` entry's `env` block (create one if it doesn't exist yet).

## 2. Understand the options

| Key | Default | Purpose |
|-----|---------|---------|
| `OASF_API_VALIDATION_SCHEMA_URL` | `https://schema.oasf.outshift.com` | OASF schema server used for validation, `get_schema`, and taxonomy lookups |
| `DIRECTORY_CLIENT_SERVER_ADDRESS` | `0.0.0.0:8888` | Address of the AGNTCY Directory server (host:port) |
| `DIRECTORY_CLIENT_AUTH_MODE` | `none` | Auth mode for the Directory client — see modes below |
| `DIRECTORY_CLIENT_AUTH_TOKEN` | _(empty)_ | Pre-issued bearer token; skips interactive login |
| `DIRECTORY_CLIENT_OIDC_ISSUER` | _(empty)_ | OIDC issuer URL (required for `oidc` mode) |
| `DIRECTORY_CLIENT_OIDC_CLIENT_ID` | _(empty)_ | OIDC client ID (required for `oidc` mode) |
| `DIRECTORY_CLIENT_SPIFFE_SOCKET_PATH` | _(empty)_ | SPIFFE Workload API socket path (for `x509`/`jwt` modes) |
| `DIRECTORY_CLIENT_SPIFFE_TOKEN` | _(empty)_ | Path to SPIFFE token file (for `token` mode) |
| `DIRECTORY_CLIENT_JWT_AUDIENCE` | _(empty)_ | JWT audience claim (for `jwt` mode) |
| `DIRECTORY_CLIENT_TLS_CERT_FILE` | _(empty)_ | Client TLS certificate file (for `tls` mode) |
| `DIRECTORY_CLIENT_TLS_KEY_FILE` | _(empty)_ | Client TLS private key file (for `tls` mode) |
| `DIRECTORY_CLIENT_TLS_CA_FILE` | _(empty)_ | CA certificate for server verification (for `tls` mode) |
| `DIRECTORY_CLIENT_TLS_SKIP_VERIFY` | _(empty)_ | Set to `true` to skip TLS certificate verification |
| `DIRECTORY_MCP_PATH` | _(bundled binary)_ | Absolute path to the `dir-mcp` server binary; overrides the binary bundled in the npm package |
| `DIRECTORY_DIRCTL_PATH` | _(bundled binary)_ | Absolute path to the `dirctl` binary; overrides the binary bundled in the npm package |

### Auth modes

| Mode | When to use |
|------|-------------|
| `none` | No auth — local or open server |
| `insecure` | Plaintext gRPC, no credentials |
| `token` | Pre-issued bearer token via `DIRECTORY_CLIENT_AUTH_TOKEN` |
| `oidc` | Interactive OIDC login (`dirctl auth login`) |
| `x509` | SPIFFE x509 SVID via Workload API |
| `jwt` | SPIFFE JWT SVID via Workload API |
| `jwt-tls` | SPIFFE JWT-SVID bearer over standard web-PKI TLS transport |
| `tls` | Mutual TLS with client cert/key |

## 3. Update a setting

Edit the `env` block directly. For example, to point to a remote Directory server with token auth:

```json
{
  "mcpServers": {
    "agntcy-dir": {
      "command": "npx",
      "args": ["-y", "@agntcy/dir-mcp"],
      "env": {
        "OASF_API_VALIDATION_SCHEMA_URL": "https://schema.oasf.outshift.com",
        "DIRECTORY_CLIENT_SERVER_ADDRESS": "dir.example.com:443",
        "DIRECTORY_CLIENT_AUTH_MODE": "token",
        "DIRECTORY_CLIENT_AUTH_TOKEN": "eyJhbGci..."
      }
    }
  }
}
```

Only include keys you want to override — omitted keys fall back to their defaults.

**After saving, reload the MCP server** — run `/mcp` or restart Claude Code. `DIRECTORY_CLIENT_*` env vars are read once at process startup — there is no watch-and-restart-on-change behavior.

## 4. Config templates

### Public AGNTCY Directory (recommended starting point)

The public AGNTCY Directory is at `ads.outshift.io:443`. It uses a publicly-trusted TLS certificate and OIDC authentication.

**With interactive login** — browser-based PKCE flow, best for interactive use:
```json
{
  "OASF_API_VALIDATION_SCHEMA_URL": "https://schema.oasf.outshift.com",
  "DIRECTORY_CLIENT_SERVER_ADDRESS": "ads.outshift.io:443",
  "DIRECTORY_CLIENT_AUTH_MODE": "oidc",
  "DIRECTORY_CLIENT_OIDC_ISSUER": "https://idp.ads.outshift.io",
  "DIRECTORY_CLIENT_OIDC_CLIENT_ID": "dirctl"
}
```

After saving, follow the `dirctl-auth` skill to log in — it locates the `dirctl` binary, runs the browser-based PKCE flow, and confirms the token is cached at `~/.config/dirctl/tokens/` before the MCP server picks it up.

**With a pre-issued bearer token** — for CI or scripted workflows:
```json
{
  "OASF_API_VALIDATION_SCHEMA_URL": "https://schema.oasf.outshift.com",
  "DIRECTORY_CLIENT_SERVER_ADDRESS": "ads.outshift.io:443",
  "DIRECTORY_CLIENT_AUTH_MODE": "oidc",
  "DIRECTORY_CLIENT_AUTH_TOKEN": "<your-bearer-token>"
}
```

### Other setups

**Schema tools only** (no Directory server needed):
```json
{
  "OASF_API_VALIDATION_SCHEMA_URL": "https://schema.oasf.outshift.com"
}
```

**Local Directory server, no auth:**
```json
{
  "OASF_API_VALIDATION_SCHEMA_URL": "https://schema.oasf.outshift.com",
  "DIRECTORY_CLIENT_SERVER_ADDRESS": "localhost:8888",
  "DIRECTORY_CLIENT_AUTH_MODE": "none"
}
```

**Remote Directory server with bearer token:**
```json
{
  "OASF_API_VALIDATION_SCHEMA_URL": "https://schema.oasf.outshift.com",
  "DIRECTORY_CLIENT_SERVER_ADDRESS": "dir.example.com:443",
  "DIRECTORY_CLIENT_AUTH_MODE": "token",
  "DIRECTORY_CLIENT_AUTH_TOKEN": "<your-token>"
}
```

**Mutual TLS:**
```json
{
  "OASF_API_VALIDATION_SCHEMA_URL": "https://schema.oasf.outshift.com",
  "DIRECTORY_CLIENT_SERVER_ADDRESS": "dir.example.com:443",
  "DIRECTORY_CLIENT_AUTH_MODE": "tls",
  "DIRECTORY_CLIENT_TLS_CERT_FILE": "~/.config/dir-mcp/client.crt",
  "DIRECTORY_CLIENT_TLS_KEY_FILE": "~/.config/dir-mcp/client.key",
  "DIRECTORY_CLIENT_TLS_CA_FILE": "~/.config/dir-mcp/ca.crt"
}
```

## 5. Verify the config is active

After updating the config and reloading the MCP server, confirm it picked up the change by calling a tool that uses the setting. For the Directory server address, try a search:

```
Call agntcy_dir_search_local with limit=1
```

A successful (even empty) response confirms the client can reach the server with the configured auth.

## 6. Managing `dirctl` contexts (only for direct `dirctl` invocations)

If the user specifically wants a named, persistent profile for invoking the bundled `dirctl` binary directly (e.g. via `npx -y --package=@agntcy/dir-mcp dirctl`) outside of any `env` block, create or edit a context in `~/.config/dirctl/config.yaml`:

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

Then switch between them with:

```sh
npx -y --package=@agntcy/dir-mcp dirctl context list
npx -y --package=@agntcy/dir-mcp dirctl context set staging
```

**This has no effect on the MCP server's own tool calls** — only on invocations of the `dirctl` binary itself, such as those made by the `search-agents` skill. Don't recommend it as a substitute for step 3 above.

## Tips

- Enable debug logging by setting `DIR_MCP_DEBUG=1` in `.mcp.json`'s `env` block to see which resolved paths and env values the wrapper is using at startup.
- If a setting still seems ignored after reloading, double check it's in the `agntcy-dir` server's own `env` block and not a shell environment variable that isn't inherited by Claude Code's MCP process.
