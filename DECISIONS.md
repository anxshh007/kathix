# Decisions

Each entry gives the decision and the reason.

1. **Database driver: Node's built-in `node:sqlite`.** It ships with Node 24, needs no native build on any OS, and supports FTS5 with the porter tokenizer (verified). So no WebAssembly fallback was needed.
2. **TypeScript 6.0.3, not 7.0.** typescript-eslint 8.72 (the latest) supports only `typescript <6.1`. The lint check is a hard requirement.
3. **Web stack: Hono server with a Vite and React client in one app.** It is lighter than a meta-framework, runs everything with one `pnpm start`, and keeps all model calls server-side.
4. **No per-package build.** Workspace packages export TypeScript source, run through tsx (server, CLI) and Vite (client). This means fewer moving parts on a clean machine.
5. **Anthropic adapter uses the official `@anthropic-ai/sdk`.** Other providers (OpenAI and OpenAI-compatible, Gemini, Ollama, Adaption) use `fetch` against their documented REST APIs. Adaption ships only a Python SDK.
6. **Adaption custom voice model is selected by id.** Adaption documents no endpoint that lists a user's trained models. The creator chooses from `GET /api/v1/models` or enters the id (`ADAPTION_VOICE_MODEL`). Kathix doesn't upload training data itself. It exports a `prompt`/`completion` JSONL that matches Adaption's documented `column_mapping`, so training calls that can't be checked without credentials never ship.
7. **Script editor: CodeMirror 6 over a plain-text script format.** It stays fast on 20,000-word scripts, gives precise cursor and range control for diffs and suggestions, and keeps character offsets exact for evidence and provenance.
8. **Standalone modes use a hidden "Scratchpad" project.** It persists work when no project is open and never appears on the shelf.
9. **Seed canon goes through a structured story-bible import path.** A code parser turns "Type: Name" blocks into proposals with verbatim spans. This lets `pnpm seed` work on a clean machine with no model provider. AI extraction from episodes stays the live import path shown in the demo.
10. **Default tier mapping from live model lists uses size hints in model ids** ("mini", "flash", "small" → fast; "pro", "large" → deep). It uses no hardcoded model names, and the creator can override it on the Model Router screen.
