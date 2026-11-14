# Kathix build progress

Resume rule: read the build brief and this file. Then carry on from the first unchecked item. Don't redo checked items.

## Status (2026-11-14)

- [x] Toolchain checked: Node 24.19, pnpm 10.34.5, git 2.55, Windows 11. No model provider keys in the environment. No Ollama. Microsoft Edge is installed (Playwright can use `channel: 'msedge'` locally).
- [x] `node:sqlite` (built into Node, no native build) verified with FTS5 and the porter tokenizer. This is the database driver.
- [x] Adaption API researched (see the Adaption notes below).
- [x] Root scaffold: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.gitignore`, `.prettierrc.json`, `.prettierignore`, directory skeleton, git repo on `main`.
- [ ] Remaining root tooling: `eslint.config.js`, `vitest.config.ts` (projects: unit, integration, evals), `playwright.config.ts` (bundled chromium, else msedge/chrome channel), `.github/workflows/ci.yml`, `.env.example`, `pnpm install`.
- [ ] packages/kernel: capabilities registry, event bus, persisted job queue, config, logger with key redaction, module contract types, encrypted settings file (AES-256-GCM, key file in the data dir). Isomorphic subpath `@kathix/kernel/shared` holds the types and the authorship span mapping.
- [ ] packages/store: node:sqlite wrapper, migrations, repositories (tables listed below)
- [ ] packages/models: router, adapters (anthropic via `@anthropic-ai/sdk`; openai / openai-compatible / gemini / ollama / adaption via fetch), mock provider, probes
- [ ] packages/prompts: templates (listed below), data-block renderer, zod validation, evidence verifier, evals
- [ ] packages/retrieval: chunking, FTS ranking, optional embeddings, boosts, token budgeter
- [ ] packages/ui: tokens, components, background system, API client, StudioContext, router
- [ ] packages/runtime: `createRuntime()` used by both the web server and the CLI
- [ ] Modules: canon, script, ledger, continuity, voice, forge, showrunner, home, router-screen
- [ ] apps/web (Hono and Vite React), apps/cli (commander), seed project, background pipeline
- [ ] Tests: unit, integration, e2e demo path, UI truth test, contrast test, performance checks
- [ ] Docs: README, ARCHITECTURE, EVALS, DEMO_SCRIPT, THIRD_PARTY, CREDITS, BUILD_REPORT

## Pinned versions (latest stable on 2026-11-14)

typescript 6.0.3 (7.0 is not supported by typescript-eslint 8.72), tsx 4.23.15, vitest 5.1.0, @playwright/test 1.65.1, eslint 10.15.0, @eslint/js 10.0.1, typescript-eslint 8.72.2, eslint-plugin-react-hooks 7.1.1, globals 17.14.0, prettier 3.10.1, @types/node 26.6.6, @types/react(-dom) 19.3.0, zod 4.6.7, @anthropic-ai/sdk 1.8.0, hono 4.13.18, @hono/node-server 2.1.8, vite 8.3.8, @vitejs/plugin-react 6.3.0, react/react-dom 19.3.1, @codemirror/state 6.7.6, @codemirror/view 6.43.15, @codemirror/commands 6.11.1, diff 9.0.0, mammoth 1.13.0, unpdf 2.2.0, docx 9.15.4, commander 15.1.0, sharp 0.35.5, @fontsource-variable/inter 5.3.0, @fontsource-variable/literata 5.3.0.

## Architecture plan (agreed design; implement as written)

- Workspace packages export TypeScript source directly (`"exports": {".": "./src/index.ts"}`). tsx runs the server and CLI, and Vite bundles the client. No per-package build step.
- Modules live in `packages/modules/<id>` with `src/manifest.ts` (isomorphic), `src/service.ts`, `src/server.ts` (routes plus agent steps), `src/ui.tsx`, and `src/cli.ts`. A single list in `apps/web/modules.config.ts` enables them. The server and CLI load them by path, and the client loads them with `import.meta.glob`. Showrunner finds pipeline steps through the `agentSteps` declared in each manifest. It never imports another module's internals.
- Standalone mode with no project open uses a hidden "Scratchpad" project (`is_scratch=1`, never shown on the shelf).
- Tables: projects, scripts, script_versions (text plus authorship spans JSON), source_docs, canon_entries, canon_entry_history, canon_links, canon_proposals, continuity_issues, continuity_dismissals, voice_profiles, voice_samples, suggestions, ledger_events, jobs, usage_records, response_cache, settings, showrunner_runs, forge_shortlist, chunks plus chunks_fts, script_fts, canon_fts.
- Prompt templates: canon-extract, cowrite, coach, continuity-check, voice-describe, voice-rewrite, forge-generate, forge-refine, showrunner-plan, draft-from-outline, probe-structured. Each template exports a deterministic `mock(input)` responder. The mock provider (enabled only by `KATHIX_MOCK_PROVIDER=1`, for tests) calls it.
- Anthropic adapter: no `temperature` (the current API rejects it). Map tiers to `output_config.effort` (fast=low, balanced=medium, deep=high). Use structured output via `output_config.format {type:'json_schema', schema}` when the probe passes. Check `stop_reason === 'refusal'`. Always pass `baseURL` and `apiKey` explicitly. Never rely on ambient `ANTHROPIC_BASE_URL`.
- Script text format: scene headings (`INT.`/`EXT.`/`SCENE`/`#` lines), speaker labels (`NAME:`), and notes (`[ ... ]` lines). The editor is CodeMirror 6 with decorations.
- Seed: "The Lantern Keepers" audio-drama podcast. Three episodes, a structured story bible (25+ entries, imported by the code parser path and approved), voice samples for two distinct authors plus held-out drafts, and episode 4 with five planted contradictions:
  1. Mirela's grey eyes are written as "brown eyes".
  2. Teodor fears deep water but dives into it.
  3. Brannoch died in episode 2 but speaks.
  4. "Ilsabet" is misspelled as "Ilsabeth".
  5. A boat leaves after the curfew bell (a broken rule).

  The seed also includes an episode 5 outline for Showrunner.

## Adaption notes (from docs.adaptionlabs.ai, read 2026-11-14)

- REST base `https://api.prod.adaptionlabs.ai`, header `Authorization: Bearer $ADAPTION_API_KEY`.
- Inference uses `POST /api/v1/responses` (an OpenAI Responses-style shape). Request fields: `model`, `input`, `instructions`, `stream`, `temperature`, `max_output_tokens`. The response carries `output_text` and `usage {input_tokens, output_tokens}`. Streaming event names are not verified, so parse defensively and fall back to a non-streaming call.
- Model listing: `GET /api/v1/models`. No endpoint for listing a user's trained models is documented, so the creator picks or enters the voice model id (`ADAPTION_VOICE_MODEL`). The id may be a hosted id or `stack:<slug>`.
- Training goes through dataset upload (`POST /api/v1/datasets` → PUT → `/upload/complete`) and then `POST /api/v1/autoscientist` with `column_mapping {prompt, completion}`. Kathix exports JSONL with `prompt` and `completion` fields. The README documents training through Adaption's app or SDK.
