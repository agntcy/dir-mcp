---
name: create-oasf-record
description: Generate, validate, and publish an OASF agent record for any codebase using the AGNTCY Agent Directory MCP tools.
---

# Create OASF Agent Record

Use this skill to register an AI agent or MCP server in the AGNTCY Agent Directory by generating a valid [OASF](https://github.com/agntcy/oasf) record.

## Workflow

### 1. Generate the record

Use the `create_record` prompt to analyze the current codebase and produce a draft OASF record:

```
/create_record
```

The prompt inspects the repo structure, README, and code to infer:
- Agent name, version, and description
- Applicable skills and domains from the OASF taxonomy
- Locators (Docker image, package URL, etc.)
- Authors and license

Optionally specify an output path:
```
/create_record output_path=agent.json
```

### 2. Explore the skill taxonomy (optional)

If the generated skills look off, browse the OASF taxonomy to find better matches:

```
Call agntcy_oasf_get_schema_skills with version="1.0.0"
```

Then drill into a category:
```
Call agntcy_oasf_get_schema_skills with version="1.0.0", parent_skill="Software Development"
```

Use the returned `id` values in the record's `skills` array.

### 3. Validate the record

Validate the JSON before publishing:

```
Call agntcy_oasf_validate_record with record_json=<the record JSON string>
```

Fix any `validation_errors` reported. Common issues:
- Missing required fields (`name`, `version`, `description`)
- Invalid skill or domain IDs (use the taxonomy tools to find correct IDs)
- Malformed locators

### 4. Publish to the Directory

Once the record is valid, push it:

```
Call agntcy_dir_push_record with record_json=<the validated record JSON>
```

Save the returned `cid` — it is the content-addressable identifier for this record version.

## Tips

- Always validate before pushing; the push tool also validates, but validating first gives better error messages.
- Use `agntcy_oasf_list_versions` to see supported schema versions if the default (1.0.0) is not right for your record.
- For agents already described in MCP, a2a, or AgentSkills format, use the `import_record` prompt to convert them first.
