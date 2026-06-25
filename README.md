# MCP Server for Directory

![GitHub Release (latest by date)](https://img.shields.io/github/v/release/agntcy/dir-mcp)
[![CI](https://github.com/agntcy/dir-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/agntcy/dir-mcp/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/agntcy/dir-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/agntcy/dir-mcp)
[![License](https://img.shields.io/github/license/agntcy/dir-mcp)](./LICENSE.md)

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for working with OASF agent records in the [AGNTCY Agent Directory](https://github.com/agntcy/dir).

The server runs via the `dirctl` CLI and connects AI assistants and IDEs to Directory infrastructure. Use it to validate and publish agent metadata, search and discover records, navigate OASF skill and domain taxonomies, and generate records from a codebase.

**Capabilities:**

- Work with OASF schemas and validate agent records
- Search, push, and pull records from Directory servers
- Verify record signatures and domain name ownership
- Import from and export to MCP, A2A, Agent Skills, and GitHub Copilot formats
- Run guided workflows via MCP prompts (create, validate, search, and more)

See [docs/directory-mcp.md](docs/directory-mcp.md) for full documentation — tools, prompts, setup, configuration, and usage.

## Contributing

Contributions are what make the open source community such an amazing place to
learn, inspire, and create. Any contributions you make are **greatly
appreciated**. For detailed contributing guidelines, please see
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

Distributed under the Apache-2.0 License. See [LICENSE.md](LICENSE.md) for more
information.
