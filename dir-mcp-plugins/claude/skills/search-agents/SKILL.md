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

### 1. Invoke dirctl through the dir-mcp npm package — never system-wide

**Never run a bare `dirctl` or search PATH/the filesystem for it.** Use the `@agntcy/dir-mcp` npm package's own bundled binary — the same package `.mcp.json` already runs via `npx -y @agntcy/dir-mcp` — via its second bin entry:

```sh
npx -y --package=@agntcy/dir-mcp dirctl <subcommand and flags>
```

Always spell out this full command in each call below — don't assign it to a shell variable first (e.g. `DIRCTL="npx ..."; $DIRCTL ...`); that assignment syntax is bash/zsh-only and fails outright under fish (`fish: Unsupported use of '='`), and you cannot assume which shell the Bash tool is running. This wrapper passes any `DIRECTORY_CLIENT_*` settings from `.mcp.json`'s `env` block straight through to `dirctl` (which uses them, together with its own `~/.config/dirctl/config.yaml` context if no env vars are set, to pick a target server), and resolves the binary itself from `DIRECTORY_DIRCTL_PATH` or its own package `bin/` directory — never from PATH. See the `dirctl-auth` skill for the full resolution details and what to do if the binary is missing.

### 2. Make sure dirctl is authenticated before pulling or searching

Check `DIRECTORY_CLIENT_AUTH_MODE` in `.mcp.json`'s `env` block (see the `dirctl-auth` skill, step 2, for how to read it). If it's `oidc`, check whether a token is already cached:

```sh
ls ~/.config/dirctl/tokens/ 2>/dev/null
```

If that directory is empty or doesn't exist, there is no token yet — **run the `dirctl-auth` skill first** and wait for the user to complete the browser login before running any `dirctl pull`/`search` command below. Don't run those commands speculatively and only react if they fail with an auth error; check up front, since the failure path costs a wasted round trip and the login still needs the same human step either way.

If a token is already cached, proceed directly to step 3. (`dirctl auth login` will also still be needed later if that cached token expires — see the Tips section below.)

### 3. Pull straight to a file, never to stdout

```sh
npx -y --package=@agntcy/dir-mcp dirctl pull <cid> --output json --output-file /tmp/record.json
```

`--output-file` writes the full record to disk without ever printing it — nothing large hits a tool result at this step. (`dirctl pull` also accepts a `name:version` in place of a CID.)

### 4. Extract only what you need with jq

```sh
jq '{name, version, description, domains, locators, skills: (.skills[:10])}' /tmp/record.json
```

Adjust the jq filter to whatever fields the task actually needs — this is the only step whose output reaches the model, so keep it small.

### Multiple records

`npx -y --package=@agntcy/dir-mcp dirctl search --format cid` (the default) is already cheap — it returns CIDs only, same as `agntcy_dir_search_local`. Loop `npx -y --package=@agntcy/dir-mcp dirctl pull ... --output-file` per CID into separate files, then run one `jq` pass across all of them (e.g. `jq -s '[.[] | {name, version}]' /tmp/record-*.json`) rather than pulling each one's full record into context individually.

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
- If `dirctl pull` or `search` fails with an auth error even after step 2 found a cached token, it likely expired — run the `dirctl-auth` skill to refresh it, then retry.
