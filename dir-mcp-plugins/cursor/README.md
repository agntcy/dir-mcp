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
| `configure-dir-mcp` | View and update the dir-mcp config file through chat — server address, auth mode, tokens, TLS, OIDC |
| `dirctl-auth` | Authenticate with the Directory using the bundled `dirctl` binary via browser-based PKCE login |

**Rules** (applied automatically):

| Rule | Triggers when… |
|------|----------------|
| `dir-mcp-config` | The user asks about server address, auth, or runtime settings |
| `dirctl-auth` | The user asks to log in, get a token, or fix auth errors from MCP tools |

## Prerequisites

- **Node.js 18+** — used to run the MCP server wrapper
- A running **AGNTCY Directory server** — required for push/pull/search/verify tools

> Schema-only tools (`validate`, `import`, `export`, `get_schema`, taxonomies) work without a Directory server. Only `OASF_API_VALIDATION_SCHEMA_URL` is needed.

## Installation

Install from the Cursor Marketplace. The plugin downloads the platform-specific MCP server binary and the `dirctl` authentication binary on first run.

## Configuration

The MCP server reads its settings from `~/.config/dir-mcp/config.json`. Use the `configure-dir-mcp` skill to update it through chat. The server restarts automatically whenever the file changes — no Cursor reload needed.

Key settings:

| Key | Purpose |
|-----|---------|
| `DIRECTORY_CLIENT_SERVER_ADDRESS` | Directory server host:port |
| `DIRECTORY_CLIENT_AUTH_MODE` | Auth mode (`none`, `token`, `oidc`, `tls`, …) |
| `DIRECTORY_MCP_PATH` | Override the bundled MCP server binary |
| `DIRECTORY_MCP_VERSION` | Expected MCP server version |
| `DIRECTORY_DIRCTL_PATH` | Override the bundled `dirctl` binary |
| `DIRECTORY_DIRCTL_VERSION` | Expected `dirctl` version |

See the `configure-dir-mcp` skill for the full option reference and ready-to-paste config templates.

## Authentication

For Directory instances that require OIDC login, use the `dirctl-auth` skill. It reads `DIRECTORY_DIRCTL_PATH` from the config (set automatically to the bundled binary) and runs the browser-based login flow. No PATH setup required.

## Quick start

1. Install the plugin from the Cursor Marketplace.
2. Ask Cursor: *"configure dir-mcp"* — the skill walks you through the config file.
3. If your Directory requires login, ask: *"authenticate with dirctl"*.
4. Open a project and ask Cursor to create an OASF record for it.

## License

Apache-2.0 — see [LICENSE](https://github.com/agntcy/dir-mcp/blob/main/LICENSE).
