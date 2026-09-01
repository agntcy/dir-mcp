# AGNTCY Agent Directory — Claude Code Plugin

Claude Code plugin for the [AGNTCY Agent Directory](https://github.com/agntcy/dir-mcp). Search, create, validate, and publish [OASF](https://github.com/agntcy/oasf) agent records directly from Claude Code.

## What it provides

**MCP tools** wired up automatically via the included `.mcp.json`:

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

**Skills** (namespaced as `/agntcy-dir:<skill-name>`):
- `create-oasf-record` — Generate, validate, and publish a record for any codebase
- `search-agents` — Discover agents and verify their authenticity

## Prerequisites

- **Node.js 18+** with `npx` — used to download and run the MCP server binary on first run
- A running **AGNTCY Directory server** (for push/pull/search/verify tools)

> If you only need OASF schema tools (validate, import, export, get_schema), no Directory server is required — only the `OASF_API_VALIDATION_SCHEMA_URL` env var is needed.

## Setup

Test locally with:

```bash
claude --plugin-dir ./claude
```

This repo doubles as a marketplace: register it once with `claude plugin marketplace add agntcy/dir-mcp`, then install with `/plugin install agntcy-dir@agntcy-dir-mcp`.

## Configuration

`.mcp.json` sets sensible defaults for a local, no-auth Directory server:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DIRECTORY_CLIENT_SERVER_ADDRESS` | `0.0.0.0:8888` | Directory server host:port |
| `DIRECTORY_CLIENT_AUTH_MODE` | `none` | Auth mode (`none`, `token`, `oidc`, `tls`, …) |
| `DIRECTORY_CLIENT_AUTH_TOKEN` | *(empty)* | Bearer token, when `DIRECTORY_CLIENT_AUTH_MODE=token` |
| `OASF_API_VALIDATION_SCHEMA_URL` | `https://schema.oasf.outshift.com` | OASF schema validation endpoint |

Override any of these in your shell environment before starting Claude Code, or edit `.mcp.json` directly for a project-specific server.

## Quick start

1. Install the plugin.
2. Open a project and use `/agntcy-dir:create-oasf-record` (or just ask Claude to register the project) to generate and publish a record.

## License

Apache-2.0 — see [LICENSE](https://github.com/agntcy/dir-mcp/blob/main/LICENSE).
