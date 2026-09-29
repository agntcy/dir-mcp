# AGNTCY Agent Directory — Cursor Plugin

Cursor plugin for the [AGNTCY Agent Directory](https://github.com/agntcy/dir-mcp). Search, create, validate, and publish [OASF](https://github.com/agntcy/oasf) agent records directly from Cursor.

## What it provides

**MCP tools** wired up automatically via the included `mcp.json`:

| Tool | Purpose |
|------|---------|
| `agntcy_dir_search_local` | Search the Directory for agents by name, skill, domain, or locator |
| `agntcy_dir_pull_record` | Fetch an agent record by CID |
| `agntcy_dir_push_record` | Publish a validated record to the Directory |
| `agntcy_dir_verify_record` | Verify a record's digital signature |
| `agntcy_dir_verify_name` | Verify domain name ownership of a record |
| `agntcy_oasf_validate_record` | Validate an OASF record against the schema |
| `agntcy_oasf_import_record` | Convert MCP/a2a/AgentSkills → OASF |
| `agntcy_oasf_export_record` | Convert OASF → a2a/GitHub Copilot/AgentSkills |
| `agntcy_oasf_get_schema` | Retrieve the full OASF schema for a version |
| `agntcy_oasf_get_schema_skills` | Browse the OASF skill taxonomy |
| `agntcy_oasf_get_schema_domains` | Browse the OASF domain taxonomy |
| `agntcy_oasf_list_versions` | List supported OASF schema versions |

**Skills:**

| Skill | Purpose |
|-------|---------|
| `configure-dir-mcp` | View and manage the `dirctl` context dir-mcp uses through chat — server address, auth mode, tokens, TLS, OIDC |
| `dirctl-auth` | Authenticate with the Directory using the bundled `dirctl` binary via browser-based PKCE login |

**Rules** (applied automatically):

| Rule | Triggers when… |
|------|----------------|
| `dir-mcp-config` | The user asks about server address, auth, or which directory instance is active |
| `dirctl-auth` | The user asks to log in, get a token, or fix auth errors from MCP tools |

## Prerequisites

- **Node.js 18+** — used to run the MCP server wrapper
- A running **AGNTCY Directory server** — required for push/pull/search/verify tools

> Schema-only tools (`validate`, `import`, `export`, `get_schema`, taxonomies) work without a Directory server. Only `OASF_API_VALIDATION_SCHEMA_URL` is needed.

## Installation

Install from the Cursor Marketplace. The plugin downloads the platform-specific MCP server binary and the `dirctl` authentication binary on first run.

## Configuration

The MCP server has no config file of its own — which directory server it talks to (address, auth mode, TLS, OIDC, ...) is entirely owned by the bundled `dirctl` binary's own **contexts**, the same way `kubectl` owns cluster contexts. Contexts live in `~/.config/dirctl/config.yaml` and are read directly by both `dirctl` and the MCP server binary — switching the active context (or setting `DIRECTORY_CLIENT_CONTEXT`) takes effect immediately, no restart-on-config-change machinery involved.

Use the `configure-dir-mcp` skill to create and switch contexts through chat.

Relevant environment variables (set in `mcp.json`'s `env` block if needed):

| Variable | Purpose |
|----------|---------|
| `OASF_API_VALIDATION_SCHEMA_URL` | OASF schema server URL (defaults to the public AGNTCY schema server) |
| `DIRECTORY_CLIENT_CONTEXT` | Name of the `dirctl` context to use, overriding its `current_context` |
| `DIRECTORY_CLIENT_SERVER_ADDRESS` | One-off override of the directory server address on top of the selected context |
| `DIRECTORY_CLIENT_AUTH_MODE` | One-off override of the auth mode (`none`, `token`, `oidc`, `tls`, …) |
| `DIRECTORY_MCP_PATH` | Override the bundled MCP server binary |
| `DIRECTORY_DIRCTL_PATH` | Override the bundled `dirctl` binary |

See the `configure-dir-mcp` skill for the full context reference and ready-to-paste templates.

## Authentication

For Directory instances that require OIDC login, use the `dirctl-auth` skill. It resolves the bundled `dirctl` binary (never PATH) and runs the browser-based login flow against the active context.

## Quick start

1. Install the plugin from the Cursor Marketplace.
2. Ask Cursor: *"configure dir-mcp"* — the skill walks you through setting up a `dirctl` context.
3. If your Directory requires login, ask: *"authenticate with dirctl"*.
4. Open a project and ask Cursor to create an OASF record for it.

## License

Apache-2.0 — see [LICENSE](https://github.com/agntcy/dir-mcp/blob/main/LICENSE).
