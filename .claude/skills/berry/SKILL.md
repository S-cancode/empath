# Berry evidence verifier

Berry is a local MCP runtime and verifier for evidence-backed coding-agent work.

## Use this skill when
- The user asks for a factual answer about a repository, plan, design, bug, or generated code.
- You need to cite gathered evidence or verify that claims are supported by evidence spans.
- You are about to produce a plan or final answer that should not rely on unstated context.

## Operating rules
1. Prefer Berry MCP tools over free-form guessing.
2. Treat Berry evidence spans as the source of truth for factual claims.
3. When Berry returns `state=need_grant`, show the requested scopes and wait for explicit user approval before calling `berry_approve`.
4. When Berry returns `state=ask_user`, ask the returned questions verbatim and retry with the same `run_id` after the user answers.
5. When Berry returns `state=done`, use the verified answer or plan.
6. If the MCP server is unavailable, ask the user to run `/Users/shivandongha/.local/pipx/venvs/berry/bin/berry mcp --server classic` or reload MCP servers.

## Embedded command
- Berry CLI: `/Users/shivandongha/.local/pipx/venvs/berry/bin/berry`
- Berry MCP: `/Users/shivandongha/.local/pipx/venvs/berry/bin/berry mcp --server classic`

Re-run `berry install` after moving/upgrading Berry, pipx, uv, or Python so generated configs refresh the embedded path.
