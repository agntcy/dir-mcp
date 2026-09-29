---
name: dirctl-auth
description: Authenticate with the AGNTCY Directory instance configured in dir-mcp using dirctl. Always invokes the dir-mcp npm package's bundled dirctl — never a system-wide or PATH-resolved binary. Use when the user asks to log in to the Directory, authenticate with dirctl, run `dirctl auth login`, get or refresh a token, or when MCP tools return auth/permission errors and the auth mode is `oidc`.
---

# Authenticate with dirctl

Use this skill to log in to the AGNTCY Directory instance that dir-mcp is configured to use. It runs `dirctl auth login` which opens a browser-based PKCE flow and caches the resulting token for the MCP server to pick up automatically.

## 1. Invoke dirctl through the dir-mcp npm package — never system-wide

**Never run a bare `dirctl`, `which dirctl`, or search the filesystem/PATH for the binary.** The `@agntcy/dir-mcp` npm package — the same one `.mcp.json` runs via `npx -y @agntcy/dir-mcp` — exposes the platform-specific `dirctl` binary it already downloaded as a second bin entry. Invoke it through npx so you always get *that* binary, not a possibly-different one that happens to be installed elsewhere on the machine:

```sh
npx -y --package=@agntcy/dir-mcp dirctl <subcommand and flags>
```

Run this exact command (with subcommand/flags appended) in place of every `dirctl` invocation below — treat `$DIRCTL` in this doc's prose as shorthand for `npx -y --package=@agntcy/dir-mcp dirctl`, not as a shell variable to actually set. Do not assign it with `VAR="..."` first: that syntax is bash/zsh-only and fails outright under fish (`fish: Unsupported use of '='`), and you cannot assume which shell the Bash tool is running. Always spell out the full `npx ...` command in each call. Internally this wrapper (`bin/dirctl.js` in the package):
- resolves the actual binary from `DIRECTORY_DIRCTL_PATH` if that's set in the environment, otherwise from its own package `bin/` directory — it never scans PATH or the rest of the filesystem;
- `chmod`s the binary executable if needed before spawning it;
- passes the process environment straight through, so any `DIRECTORY_CLIENT_*` env vars set in `.mcp.json`'s `env` block reach `dirctl` too, where they act as overrides on top of whatever context `dirctl`'s own config (`~/.config/dirctl/config.yaml`) has selected.

If `dirctl version` (or any subcommand) fails with "dirctl binary not found", the platform download at install time failed — tell the user to re-run `npx -y @agntcy/dir-mcp` once, or reinstall the plugin, to restore it. Do not fall back to a system `dirctl` even if one is present.

## 2. Read the active connection settings

`dirctl` reads its target Directory server the same way the MCP server does: `DIRECTORY_CLIENT_*` environment variables. Since `dirctl` and the MCP server are separate programs, you need these values yourself to pass as flags below. Read the `agntcy-dir` server's `env` block:

```sh
cat .mcp.json
```

Note the values of:
- `DIRECTORY_CLIENT_SERVER_ADDRESS` — the Directory server (host:port)
- `DIRECTORY_CLIENT_OIDC_ISSUER` — the OIDC issuer URL
- `DIRECTORY_CLIENT_OIDC_CLIENT_ID` — the OIDC client ID
- `DIRECTORY_CLIENT_AUTH_MODE` — must be `oidc` for interactive login

If none of these env vars are set in `.mcp.json`, `dirctl` falls back to its own config at `~/.config/dirctl/config.yaml` — check `current_context` there (or `npx -y --package=@agntcy/dir-mcp dirctl context show`) instead.

If `DIRECTORY_CLIENT_AUTH_MODE` is not `oidc`, tell the user:

> The current auth mode is `<mode>`. Interactive login via `dirctl auth login` only applies to `oidc` mode. To switch, update `DIRECTORY_CLIENT_AUTH_MODE` to `oidc` in `.mcp.json`'s `env` block and set `DIRECTORY_CLIENT_OIDC_ISSUER` and `DIRECTORY_CLIENT_OIDC_CLIENT_ID`. Use the `configure-dir-mcp` skill for guidance.

## 3. Run the login flow

**Always use the browser flow — never `--no-browser`.** OIDC login is a PKCE flow that requires a human to authenticate in a real browser session (enter credentials, approve consent, complete MFA); it cannot be finished by this skill on its own, no matter what flags or endpoints are tried. Do not reach for `--no-browser` as a way to "handle" login yourself — it does not let you complete the flow, it only relocates the same manual step to a URL the user still has to open and finish by hand. Use it only in the rare case where step 5 below confirms no local browser could launch at all, and even then the user — not this skill — must open the printed URL and complete login.

Pass the issuer and client ID from `.mcp.json` explicitly so the login targets the correct Directory:

```sh
npx -y --package=@agntcy/dir-mcp dirctl auth login \
  --oidc-issuer "<DIRECTORY_CLIENT_OIDC_ISSUER value from .mcp.json>" \
  --oidc-client-id "<DIRECTORY_CLIENT_OIDC_CLIENT_ID value from .mcp.json>"
```

Substitute the actual values read from `.mcp.json` in step 2 — don't rely on those env var names being set in your own shell.

If neither is set (relying on a `dirctl` context instead), run without flags:

```sh
npx -y --package=@agntcy/dir-mcp dirctl auth login
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
npx -y --package=@agntcy/dir-mcp dirctl auth status
```

A successful output (exit 0) confirms authentication is active.

## 5. Confirm the MCP server will pick it up

The dir-mcp server reads the cached token from `~/.config/dirctl/tokens/` at startup when `DIRECTORY_CLIENT_AUTH_MODE` is `oidc` and `DIRECTORY_CLIENT_OIDC_ISSUER` matches. If the server is already running, tell the user:

> Restart Claude Code (or run `/mcp` to reload the MCP server) so dir-mcp picks up the new token.

Then ask the user to call a Directory tool to verify end-to-end connectivity:

```
Call agntcy_dir_search_local with limit=1
```

A successful (even empty) response confirms the MCP server is authenticated.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `dirctl version` reports "dirctl binary not found" | The platform binary failed to download at install time; re-run `npx -y @agntcy/dir-mcp` once (or reinstall the plugin) to retry the download. Do not substitute a system-installed `dirctl` |
| Browser does not open | Run `npx -y --package=@agntcy/dir-mcp dirctl auth login --no-browser`, then give the user the printed URL — the user, not this skill, must open it and complete login manually |
| `dirctl auth status` fails | Re-run `npx -y --package=@agntcy/dir-mcp dirctl auth login`; the cached token may have expired |
| `dirctl auth login` fails with a shell syntax error (e.g. "Unsupported use of '='") | The command was run under fish with a bash-style `VAR="..."` assignment; always spell out the full `npx -y --package=@agntcy/dir-mcp dirctl ...` command instead of assigning it to a shell variable first |
| MCP tools still fail after login | Check that `DIRECTORY_CLIENT_AUTH_MODE` is `oidc` in `.mcp.json`'s `env` block, then reload via `/mcp` or restart Claude Code — token pickup requires a full server restart |
| Token cached but server rejects it | Confirm `DIRECTORY_CLIENT_SERVER_ADDRESS` and `DIRECTORY_CLIENT_OIDC_ISSUER` match the intended Directory instance in both `.mcp.json` and (if used) the active `dirctl` context |
