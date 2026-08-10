---
name: dirctl-auth
description: Authenticate with the AGNTCY Directory instance configured in dir-mcp using dirctl. Uses the bundled binary or the path set in DIRECTORY_DIRCTL_PATH — never scans PATH.
---

# Authenticate with dirctl

Use this skill to log in to the AGNTCY Directory instance that dir-mcp is configured to use. It runs `dirctl auth login` which opens a browser-based PKCE flow and caches the resulting token for the MCP server to pick up automatically.

## 1. Locate the dirctl binary

**Do not scan PATH or the filesystem for `dirctl`.** The only two accepted sources are:

1. **Config file** — `DIRECTORY_DIRCTL_PATH` in `~/.config/dir-mcp/config.json` (or `$DIR_MCP_CONFIG`)
2. **Bundled binary** — `DIRECTORY_DIRCTL_PATH` injected by the npm wrapper at startup (set automatically to the binary downloaded alongside the MCP server)

Set the `DIRCTL` variable to the resolved path. The npm wrapper sets it automatically; the fallback reads the config file if it was not injected:

```sh
DIRCTL="${DIRCTL:-${DIRECTORY_DIRCTL_PATH:-$(python3 -c "import sys,json; print(json.load(open('${DIR_MCP_CONFIG:-$HOME/.config/dir-mcp/config.json}')).get('DIRECTORY_DIRCTL_PATH',''))" 2>/dev/null)}}"
```

If `$DIRCTL` is empty or the file at that path does not exist, stop and ask the user:

> `DIRECTORY_DIRCTL_PATH` is not set or points to a missing file. Set it in `~/.config/dir-mcp/config.json` to the bundled binary path (printed by the npm wrapper at startup with `DIR_MCP_DEBUG=1`) or to a manually installed `dirctl` binary. Do not add `dirctl` to PATH — use the config key instead.

Use `$DIRCTL` in place of `dirctl` in all subsequent commands.

If `DIRECTORY_DIRCTL_VERSION` is set in the config, verify the installed binary matches:

```sh
"$DIRCTL" version
```

If the version does not match `DIRECTORY_DIRCTL_VERSION`, warn the user:

> The installed `dirctl` version does not match the expected version in the config (`DIRECTORY_DIRCTL_VERSION`). Proceed with caution or install the expected version.

## 2. Read the active dir-mcp config

Resolve and read the config file to determine which Directory instance is being used:

```sh
cat "${DIR_MCP_CONFIG:-$HOME/.config/dir-mcp/config.json}"
```

Note the values of:
- `DIRECTORY_CLIENT_SERVER_ADDRESS` — the Directory server (host:port)
- `DIRECTORY_CLIENT_OIDC_ISSUER` — the OIDC issuer URL
- `DIRECTORY_CLIENT_OIDC_CLIENT_ID` — the OIDC client ID
- `DIRECTORY_CLIENT_AUTH_MODE` — must be `oidc` for interactive login

If `DIRECTORY_CLIENT_AUTH_MODE` is not `oidc`, tell the user:

> The current auth mode is `<mode>`. Interactive login via `dirctl auth login` only applies to `oidc` mode. To switch, update `DIRECTORY_CLIENT_AUTH_MODE` to `oidc` in the config and set `DIRECTORY_CLIENT_OIDC_ISSUER` and `DIRECTORY_CLIENT_OIDC_CLIENT_ID`. Use the `configure-dir-mcp` skill for guidance.

If the config file does not exist, show the user the OIDC template from the `configure-dir-mcp` skill and ask them to create it before continuing.

## 3. Run the login flow

Pass the issuer and client ID from the config explicitly so the login targets the correct Directory:

```sh
"$DIRCTL" auth login \
  --oidc-issuer "$DIRECTORY_CLIENT_OIDC_ISSUER" \
  --oidc-client-id "$DIRECTORY_CLIENT_OIDC_CLIENT_ID"
```

If the config does not have separate issuer/client-id fields (older configs may rely on dirctl's own defaults), run without flags:

```sh
"$DIRCTL" auth login
```

The command opens a browser window. Tell the user to complete the login there. Once complete, the token is cached at `~/.config/dirctl/tokens/`.

## 4. Verify the token was cached

Confirm the login succeeded by checking the token cache:

```sh
ls ~/.config/dirctl/tokens/
```

A non-empty listing means the token was stored. Then verify the token is accepted by the server:

```sh
"$DIRCTL" auth status
```

A successful output (exit 0) confirms authentication is active.

## 5. Confirm the MCP server will pick it up

The dir-mcp server reads the cached token from `~/.config/dirctl/tokens/` at startup when `DIRECTORY_CLIENT_AUTH_MODE` is `oidc`. If the server is already running, tell the user:

> Restart Cursor (or reload the MCP server) so dir-mcp picks up the new token.

Then ask the user to call a Directory tool to verify end-to-end connectivity:

```
Call agntcy_dir_search_local with limit=1
```

A successful (even empty) response confirms the MCP server is authenticated.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `DIRECTORY_DIRCTL_PATH` empty or missing | Set it in `~/.config/dir-mcp/config.json` to the bundled binary path or a manually installed binary; never use PATH |
| Browser does not open | Run `dirctl auth login --no-browser` and follow the printed URL manually |
| `dirctl auth status` fails | Re-run `dirctl auth login`; the cached token may have expired |
| MCP tools still fail after login | Check that `DIRECTORY_CLIENT_AUTH_MODE` is `oidc` in the config; the wrapper restarts automatically on config change, but token pickup requires a full server restart — reload via Cursor's MCP panel |
| Token cached but server rejects it | Confirm `DIRECTORY_CLIENT_SERVER_ADDRESS` and `DIRECTORY_CLIENT_OIDC_ISSUER` match the intended Directory instance |
