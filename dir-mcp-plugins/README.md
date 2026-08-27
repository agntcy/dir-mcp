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
- `create-oasf-record` — Generate, validate, and publish a record for any codebase
- `search-agents` — Discover agents and verify their authenticity
- `configure-dir-mcp` — View and update the dir-mcp config JSON through chat (server address, auth mode, tokens, TLS, OIDC)

**Rules:**
- `oasf-records` — Best practices applied automatically when working with OASF records
- `dir-mcp-config` — Guides configuration of the dir-mcp runtime settings when asked

## Prerequisites

- **Node.js 18+** with `npx` — used to download and run the MCP server binary on first run
- A running **AGNTCY Directory server** (for push/pull/search/verify tools)

> If you only need OASF schema tools (validate, import, export, get_schema), no Directory server is required — only the `OASF_API_VALIDATION_SCHEMA_URL` env var is needed.

## Setup

Copy `mcp.json` to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project).

On first run `npx` downloads the `@agntcy/dir-mcp` package, which fetches the platform-specific binary and caches it in the npm cache. Subsequent starts reuse the cached binary.

## Configuration

Use the `configure-dir-mcp` skill to set up the server through chat. It walks you through the config file at `~/.config/dir-mcp/config.json` with ready-to-paste templates for common setups: local/no-auth, remote with bearer token, OIDC, and mutual TLS.

## Quick start

1. Install the plugin from the Cursor Marketplace.
2. Ask Cursor to configure dir-mcp — the `configure-dir-mcp` skill guides you through it.
3. Open a project and use `/create_record` to register it in the Directory.

## License

Apache-2.0 — see [LICENSE](https://github.com/agntcy/dir-mcp/blob/main/LICENSE).
