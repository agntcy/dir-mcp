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

Run this exact command (with subcommand/flags appended) in place of every `dirctl` invocation below — treat `$DIRCTL` in this doc's prose as shorthand for `npx -y --package=@agntcy/dir-mcp dirctl`, not as a shell variable to actually set. Do not assign it with `VAR="..."` first: that syntax is bash/zsh-only and fails outright under fish (`fish: Unsupported use of '='`), and you cannot assume which shell the Bash tool is running. Always spell out the full `npx ...` command in each call. Internally this wrapper (`bin/dirctl.js` in the package) already:
- loads `~/.config/dir-mcp/config.json` (or `$DIR_MCP_CONFIG`) and merges it under the process environment, so it picks up `DIRECTORY_CLIENT_*` settings automatically — you don't need to export them yourself;
- resolves the actual binary from `DIRECTORY_DIRCTL_PATH` if that's set (config or env), otherwise from its own package `bin/` directory — it never scans PATH or the rest of the filesystem;
- `chmod`s the binary executable if needed before spawning it.

If `dirctl version` (or any subcommand) fails with "dirctl binary not found", the platform download at install time failed — tell the user to re-run `npx -y @agntcy/dir-mcp` once, or reinstall the plugin, to restore it. Do not fall back to a system `dirctl` even if one is present.

If `DIRECTORY_DIRCTL_VERSION` is set in the config, verify the installed binary matches:

```sh
npx -y --package=@agntcy/dir-mcp dirctl version
```

If the version does not match `DIRECTORY_DIRCTL_VERSION`, warn the user:

> The installed `dirctl` version does not match the expected version in the config (`DIRECTORY_DIRCTL_VERSION`). Proceed with caution or install the expected version.

## 2. Read the active dir-mcp config

`dirctl` loads the config for its own use, but you still need its values yourself to pass as flags below. Resolve the path to an absolute one first — file tools do not expand `~`, and any edit driven by this skill (e.g. via the `configure-dir-mcp` skill) must target this resolved absolute path or it will silently miss the real config:

```sh
cat ~/.config/dir-mcp/config.json
```

If a `DIR_MCP_CONFIG` environment variable is set, it overrides that default path — check with `printenv DIR_MCP_CONFIG` (portable across bash/zsh/fish) and `cat` that path instead. Avoid bash-only expansion forms like `${VAR:-default}` or a separate `VAR="..."` assignment step — both fail under fish.

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
npx -y --package=@agntcy/dir-mcp dirctl auth login \
  --oidc-issuer "<DIRECTORY_CLIENT_OIDC_ISSUER value from the config>" \
  --oidc-client-id "<DIRECTORY_CLIENT_OIDC_CLIENT_ID value from the config>"
```

Substitute the actual values read from the config file in step 2 — don't rely on the config's env var names being set in your own shell.

If the config does not have separate issuer/client-id fields (older configs may rely on dirctl's own defaults), run without flags:

```sh
npx -y --package=@agntcy/dir-mcp dirctl auth login
```

The command opens a browser window. Tell the user to complete the login there. Once complete, the token is cached at `~/.config/dirctl/tokens/`.

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

The dir-mcp server reads the cached token from `~/.config/dirctl/tokens/` at startup when `DIRECTORY_CLIENT_AUTH_MODE` is `oidc`. If the server is already running, tell the user:

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
| Browser does not open | Run `npx -y --package=@agntcy/dir-mcp dirctl auth login --no-browser` and follow the printed URL manually |
| `dirctl auth status` fails | Re-run `npx -y --package=@agntcy/dir-mcp dirctl auth login`; the cached token may have expired |
| `dirctl auth login` fails with a shell syntax error (e.g. "Unsupported use of '='") | The command was run under fish with a bash-style `VAR="..."` assignment; always spell out the full `npx -y --package=@agntcy/dir-mcp dirctl ...` command instead of assigning it to a shell variable first |
| MCP tools still fail after login | Check that `DIRECTORY_CLIENT_AUTH_MODE` is `oidc` in the config; the wrapper restarts automatically on config change, but token pickup requires a full server restart — reload via `/mcp` or restart Claude Code |
| Token cached but server rejects it | Confirm `DIRECTORY_CLIENT_SERVER_ADDRESS` and `DIRECTORY_CLIENT_OIDC_ISSUER` match the intended Directory instance |
