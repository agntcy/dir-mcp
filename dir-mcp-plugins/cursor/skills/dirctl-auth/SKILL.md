---
name: dirctl-auth
description: Authenticate with the AGNTCY Directory instance configured in dir-mcp using dirctl. Uses the bundled binary or the path set in DIRECTORY_DIRCTL_PATH — never scans PATH.
---

# Authenticate with dirctl

Use this skill to log in to the AGNTCY Directory instance that dir-mcp is configured to use. It runs `dirctl auth login` which opens a browser-based PKCE flow and caches the resulting token for the MCP server to pick up automatically.

## 1. Locate the dirctl binary

**Do not scan PATH or the filesystem for `dirctl`.** The only two accepted sources are:

1. **`DIRECTORY_DIRCTL_PATH`** — set in `mcp.json`'s `env` block for the `agntcy-dir` server
2. **Bundled binary** — `DIRECTORY_DIRCTL_PATH` injected by the npm wrapper at startup (set automatically to the binary downloaded alongside the MCP server)

Read the resolved value from the environment:

```sh
printenv DIRECTORY_DIRCTL_PATH
```

If the value is empty or the file at that path does not exist, stop and ask the user:

> `DIRECTORY_DIRCTL_PATH` is not set or points to a missing file. Set it in `mcp.json`'s `env` block to the bundled binary path (printed by the npm wrapper at startup with `DIR_MCP_DEBUG=1`) or to a manually installed `dirctl` binary. Do not add `dirctl` to PATH — use the env var instead.

Use the resolved path in all subsequent commands by substituting it for `dirctl`.

## 2. Read the active connection settings

`dirctl` resolves its target server the same way the MCP server does: `DIRECTORY_CLIENT_*` environment variables set in `mcp.json`'s `env` block, which override any `dirctl` context. Read the `agntcy-dir` server's `env` block:

```sh
cat ~/.cursor/mcp.json 2>/dev/null || cat .cursor/mcp.json
```

Note the values of:
- `DIRECTORY_CLIENT_SERVER_ADDRESS` — the Directory server (host:port)
- `DIRECTORY_CLIENT_OIDC_ISSUER` — the OIDC issuer URL
- `DIRECTORY_CLIENT_OIDC_CLIENT_ID` — the OIDC client ID
- `DIRECTORY_CLIENT_AUTH_MODE` — must be `oidc` for interactive login

If none of these env vars are set, `dirctl` falls back to its own config at `~/.config/dirctl/config.yaml` — check `current_context` there (or `dirctl context show`) instead.

If `DIRECTORY_CLIENT_AUTH_MODE` is not `oidc`, tell the user:

> The current auth mode is `<mode>`. Interactive login via `dirctl auth login` only applies to `oidc` mode. To switch, update `DIRECTORY_CLIENT_AUTH_MODE` to `oidc` in `mcp.json`'s `env` block and set `DIRECTORY_CLIENT_OIDC_ISSUER` and `DIRECTORY_CLIENT_OIDC_CLIENT_ID`. Use the `configure-dir-mcp` skill for guidance.

## 3. Run the login flow

**Always use the browser flow — never `--no-browser`.** OIDC login is a PKCE flow that requires a human to authenticate in a real browser session (enter credentials, approve consent, complete MFA); it cannot be finished by this skill on its own, no matter what flags or endpoints are tried. Do not reach for `--no-browser` as a way to "handle" login yourself — it does not let you complete the flow, it only relocates the same manual step to a URL the user still has to open and finish by hand. Use it only in the rare case where step 5 below confirms no local browser could launch at all, and even then the user — not this skill — must open the printed URL and complete login.

Pass the issuer, client ID, and server address explicitly so the login targets the correct Directory:

```sh
dirctl auth login \
  --oidc-issuer "$DIRECTORY_CLIENT_OIDC_ISSUER" \
  --oidc-client-id "$DIRECTORY_CLIENT_OIDC_CLIENT_ID" \
  --server-addr "$DIRECTORY_CLIENT_SERVER_ADDRESS"
```

For the public AGNTCY Directory specifically, this is:

```sh
dirctl auth login \
  --oidc-issuer "https://idp.ads.outshift.io" \
  --oidc-client-id "dirctl" \
  --server-addr "ads.outshift.io:443"
```

If none of these are set (relying on a `dirctl` context instead), run without flags:

```sh
dirctl auth login
```

Do not guess at the issuer, client ID, or server address, and do not retry the command against different candidate values hoping one works (e.g. alternating between endpoint guesses). If step 2 didn't yield a definite value, stop and ask the user for the correct one instead of trying multiple endpoints in a loop.

The command opens a browser window and then blocks, waiting for the login to complete — this is expected. Tell the user a browser window has opened and ask them to complete the login there; do not treat the command as stuck or try to route around it while it's waiting. Once the user confirms they've finished, or the command returns, the token is cached at `~/.config/dirctl/tokens/`.

## 4. Verify the token was cached

Confirm the login succeeded by checking the token cache:

```sh
ls ~/.config/dirctl/tokens/
```

A non-empty listing means the token was stored. Then verify the token is accepted by the server:

```sh
dirctl auth status
```

A successful output (exit 0) confirms authentication is active.

## 5. Confirm the MCP server will pick it up

The dir-mcp server reads the cached token from `~/.config/dirctl/tokens/` at startup when `DIRECTORY_CLIENT_AUTH_MODE` is `oidc` and `DIRECTORY_CLIENT_OIDC_ISSUER` matches. If the server is already running, tell the user:

> Reload the MCP server in Cursor (or restart Cursor) so dir-mcp picks up the new token.

Then ask the user to call a Directory tool to verify end-to-end connectivity:

```
Call agntcy_dir_search_local with limit=1
```

A successful (even empty) response confirms the MCP server is authenticated.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `DIRECTORY_DIRCTL_PATH` empty or missing | Set it in `mcp.json`'s `env` block to the bundled binary path or a manually installed binary; never use PATH |
| Browser does not open | Run `dirctl auth login --no-browser`, then give the user the printed URL — the user, not this skill, must open it and complete login manually |
| `dirctl auth status` fails | Re-run `dirctl auth login`; the cached token may have expired |
| MCP tools still fail after login | Check that `DIRECTORY_CLIENT_AUTH_MODE` is `oidc` in `mcp.json`'s `env` block, then reload the MCP server via Cursor's MCP panel — token pickup requires a full server restart |
| Token cached but server rejects it | Confirm `DIRECTORY_CLIENT_SERVER_ADDRESS` and `DIRECTORY_CLIENT_OIDC_ISSUER` match the intended Directory instance in both `mcp.json` and (if used) the active `dirctl` context |
