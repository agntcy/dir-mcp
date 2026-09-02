---
name: search-agents
description: Search the AGNTCY Agent Directory for AI agents and MCP servers, pull records by CID without blowing the tool-result token limit, and verify their authenticity.
---

# Search and Discover Agents

Use this skill to find AI agents and MCP servers in the AGNTCY Agent Directory, inspect their records, and verify their authenticity.

## Search the Directory

Use `agntcy_dir_search_local` to find agents. All parameters are optional and combinable:

**By capability (skill):**
```
Call agntcy_dir_search_local with skill_names=["*python*", "*data-analysis*"]
```

**By name pattern:**
```
Call agntcy_dir_search_local with names=["my-agent*"], versions=["v1.*"]
```

**By domain:**
```
Call agntcy_dir_search_local with domain_names=["*finance*"]
```

**By locator type (e.g. Docker images only):**
```
Call agntcy_dir_search_local with locators=["docker-image:*"]
```

**Paginated:**
```
Call agntcy_dir_search_local with limit=20, offset=40
```

Wildcard patterns: `*` matches any sequence, `?` matches one character, `[abc]` matches a set.
Multiple filters within a call are combined with OR logic.

The search returns `record_cids` — content identifiers you can use to fetch the full record.

## Fetch a Record

`agntcy_dir_pull_record` returns the entire record inline. Populated records routinely exceed 50KB — well past the tool-result token limit — get truncated to a saved file, and burn a large chunk of context reading that file back in even when only a few fields are needed. **Only use `agntcy_dir_pull_record` directly for a quick check when you expect a small record** (e.g. one you just created and know is minimal). For anything else — browsing search results, inspecting third-party records, or pulling more than one — pull with the bundled `dirctl` binary and filter with `jq` before any of it reaches the model.

### 1. Resolve the dirctl binary and Directory connection

Never scan PATH for `dirctl` (same rule as the `dirctl-auth` skill). Resolve the bundled/configured binary path, and export the `DIRECTORY_CLIENT_*` connection settings from the dir-mcp config as environment variables — `dirctl` reads its server address and auth mode from the environment only, it does not read the `~/.config/dir-mcp/config.json` file itself:

```sh
DIR_MCP_CONFIG_PATH="${DIR_MCP_CONFIG:-$HOME/.config/dir-mcp/config.json}"
DIRCTL="${DIRECTORY_DIRCTL_PATH:-$(python3 -c "import json; print(json.load(open('$DIR_MCP_CONFIG_PATH')).get('DIRECTORY_DIRCTL_PATH',''))" 2>/dev/null)}"
eval "$(python3 -c "
import json
cfg = json.load(open('$DIR_MCP_CONFIG_PATH'))
for k in ('DIRECTORY_CLIENT_SERVER_ADDRESS', 'DIRECTORY_CLIENT_AUTH_MODE', 'DIRECTORY_CLIENT_AUTH_TOKEN', 'DIRECTORY_CLIENT_OIDC_ISSUER', 'DIRECTORY_CLIENT_OIDC_CLIENT_ID'):
    if cfg.get(k):
        print(f'export {k}={json.dumps(cfg[k])}')
")"
```

If `$DIRCTL` is empty, stop and point the user at the `dirctl-auth` skill's binary-lookup step before continuing.

### 2. Pull straight to a file, never to stdout

```sh
"$DIRCTL" pull <cid> --output json --output-file /tmp/record.json
```

`--output-file` writes the full record to disk without ever printing it — nothing large hits a tool result at this step. (`dirctl pull` also accepts a `name:version` in place of a CID.)

### 3. Extract only what you need with jq

```sh
jq '{name, version, description, domains, locators, skills: (.skills[:10])}' /tmp/record.json
```

Adjust the jq filter to whatever fields the task actually needs — this is the only step whose output reaches the model, so keep it small.

### Multiple records

`dirctl search --format cid` (the default) is already cheap — it returns CIDs only, same as `agntcy_dir_search_local`. Loop `dirctl pull ... --output-file` per CID into separate files, then run one `jq` pass across all of them (e.g. `jq -s '[.[] | {name, version}]' /tmp/record-*.json`) rather than pulling each one's full record into context individually.

## Verify a Record

**Verify the digital signature (integrity check):**
```
Call agntcy_dir_verify_record with cid="bafkrei..."
```

Returns `success=true` and `signers` info when the record has a valid signature.

**Verify domain name ownership:**
```
Call agntcy_dir_verify_name with name="https://example.com/my-agent"
```

This confirms the record was signed with a key from the domain's `/.well-known/jwks.json`, proving the publisher owns the domain.

## Export a Record to Another Format

Convert a fetched OASF record to a2a, GitHub Copilot, or AgentSkills format:

```
Call agntcy_oasf_export_record with record_json=<the record JSON>, target_format="a2a"
```

Supported `target_format` values: `a2a`, `ghcopilot`, `agentskills`.

## Tips

- Start broad (by skill or domain), then narrow with additional filters.
- Always verify records before using them in production pipelines.
- Use `agntcy_oasf_validate_record` on pulled records to confirm they are still schema-valid — for a `dirctl`-pulled record, pass the full file content (`$(cat /tmp/record.json)`), not the jq-filtered summary, since validation needs every field.
- If `dirctl pull` fails with an auth error, run the `dirctl-auth` skill first — `dirctl` needs a cached token the same way the MCP server does.
