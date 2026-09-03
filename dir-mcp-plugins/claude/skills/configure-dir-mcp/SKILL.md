---
name: configure-dir-mcp
description: View and update the dir-mcp configuration file through chat to set the directory server address, authentication mode, and other runtime options. Use when the user asks to configure dir-mcp, change the server address, set an auth token, switch auth mode, configure OIDC or TLS, or update the OASF schema URL.
---

# Configure dir-mcp

Use this skill to inspect and update the dir-mcp runtime configuration at `~/.config/dir-mcp/config.json` (or the path in `$DIR_MCP_CONFIG`).

## 1. Find the config file

Resolve the active config path to an **absolute path** — do not use `~` with your file-read/file-write tools. Those tools open paths literally and do not expand `~`, so an edit "to `~/.config/dir-mcp/config.json`" can silently create a file named `~` under the current working directory instead of touching the real config. Always resolve first:

```sh
echo "${DIR_MCP_CONFIG:-$HOME/.config/dir-mcp/config.json}"
```

Use the printed absolute path (e.g. `/Users/alice/.config/dir-mcp/config.json`) for every subsequent read or edit in this skill — never the literal `~/...` string.

Read it with that absolute path:

```sh
cat "${DIR_MCP_CONFIG:-$HOME/.config/dir-mcp/config.json}"
```

If the file does not exist, the npm wrapper creates it with defaults on first run. You can also create it manually — see the template in step 4.

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
| `DIRECTORY_MCP_VERSION` | _(npm package version)_ | Expected `dir-mcp` server version; logged at startup for diagnostics |
| `DIRECTORY_DIRCTL_PATH` | _(bundled binary)_ | Absolute path to the `dirctl` binary; overrides the binary bundled in the npm package |
| `DIRECTORY_DIRCTL_VERSION` | _(empty)_ | Expected `dirctl` version (e.g. `1.6.3`); `dirctl-auth` warns if the installed version does not match |

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

Edit the file directly, using the absolute path resolved in step 1 (not the literal `~/...` path — file-edit tools do not expand it, and writing to `~/...` verbatim will create an unrelated file instead of updating the real config). For example, to point to a remote Directory server with token auth:

```json
{
  "OASF_API_VALIDATION_SCHEMA_URL": "https://schema.oasf.outshift.com",
  "DIRECTORY_CLIENT_SERVER_ADDRESS": "dir.example.com:443",
  "DIRECTORY_CLIENT_AUTH_MODE": "token",
  "DIRECTORY_CLIENT_AUTH_TOKEN": "eyJhbGci..."
}
```

Only include keys you want to override — omitted keys fall back to their defaults.

After saving, the npm wrapper detects the change and restarts the MCP server automatically — no Claude Code restart needed.

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

## 5. Confirm the write persisted

Before relying on the change, re-read the config from the same absolute path and diff it against what you intended to write:

```sh
cat "${DIR_MCP_CONFIG:-$HOME/.config/dir-mcp/config.json}"
```

If the values don't match what you edited, the write did not land on the real file (e.g. it landed on a stray `~`-named file/dir under the current working directory) — locate and remove that stray file, then redo the edit against the resolved absolute path.

## 6. Verify the config is active

After updating the config, confirm the server picks it up by calling a tool that uses the setting. For the Directory server address, try a search:

```
Call agntcy_dir_search_local with limit=1
```

A successful (even empty) response confirms the client can reach the server with the configured auth.

## Tips

- Environment variables and `.mcp.json` `env` entries override config file values — check those first if your changes seem ignored.
- Enable debug logging by setting `DIR_MCP_DEBUG=1` in `.mcp.json` `env` to see which config values are loaded at startup.
- The config file path itself is set via the `DIR_MCP_CONFIG` env var in `.mcp.json` — change it there if you need separate configs per project.
