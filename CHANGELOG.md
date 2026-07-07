# Changelog

All notable changes to the open core of Mnema are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries here cover the **open-core** (`mnema`) repository. Enterprise modules
(knowledge graph, meeting intelligence, org/IAM+SSO, audit, multi-workspace) are
tracked separately and are not part of this project. Releases are cut as
annotated, signed tags on `main` — see [RELEASING.md](./RELEASING.md).

## [Unreleased]

## [0.1.0] — 2026-07-07

First public snapshot of the Mnema open core. Summarizes the current state of
what this repository ships.

### Added

- **Docs workspace.** Real-time collaborative editor (Hocuspocus/Yjs), folders,
  and search over your documents.
- **Flows.** Build step-by-step workflows and walk them via MCP; includes
  **capture** steps (an agent writes a doc at walk-time) and per-run history.
- **MCP server.** Read your context and propose/commit writes from any MCP-aware
  client (Claude, ChatGPT, Cursor, Windsurf, Cline) over the Model Context
  Protocol — no uploads or copy-paste.
- **Auth.** Built-in email + password sign-in, or generic OIDC.
- **Version history + document export**, free with a community license.
- **Developer platform.** REST API + API keys to embed Mnema in your own app.
- **Self-host.** Single-command Docker Compose stack (postgres, redis, api,
  collab, workers, web); idempotent migrations on first boot.
- Community-health and compliance documentation: `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, `SUPPORT.md`, `MAINTAINERS.md`, `GOVERNANCE.md`,
  `RELEASING.md`, this changelog, and GitHub issue-form templates.
- Dependabot configuration (npm, GitHub Actions, Docker) and hardened CI
  workflows (least-privilege `permissions`, actions pinned to commit SHAs).

[Unreleased]: https://github.com/nbkdoesntknowcoding/mnema/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nbkdoesntknowcoding/mnema/releases/tag/v0.1.0
