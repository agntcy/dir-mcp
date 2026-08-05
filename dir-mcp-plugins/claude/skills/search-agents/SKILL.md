---
name: search-agents
description: Search the AGNTCY Agent Directory for AI agents and MCP servers, pull records by CID, and verify their authenticity.
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

Pull a full record by its CID:

```
Call agntcy_dir_pull_record with cid="bafkrei..."
```

The returned `record_data` is a JSON string containing the full OASF record.

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
- Use `agntcy_oasf_validate_record` on pulled records to confirm they are still schema-valid.
