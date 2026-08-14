# deepseek-harness-mem

**Persistent semantic memory for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** — a community plugin inspired by [opencode-mem](https://github.com/tickernelz/opencode-mem).

It gives the coding agent a durable, SQLite-backed memory with local CPU embeddings, and adds a small **memory widget to the top-right of the web GUI**: live status, quick semantic search, one-click recording, model switching — with fluent animations whenever the AI reads or writes memory.

> Community project. Not affiliated with or endorsed by DeepSeek. The package names follow the harness naming convention (`@deepseek-ai/dsh-*`) so they slot into a profile unchanged; these packages are **not published to npm**.
>
> 中文文档：[README.zh.md](README.zh.md)

---

## Features

**For the agent (host plugin `@deepseek-ai/dsh-mem`)**

- `mem_record` / `mem_search` / `mem_forget` tools with deduplication and `project` / `global` scoping (project = the session's working-directory tree, mirroring opencode-mem's per-project shards).
- A system-prompt section that tells the model **when to read and when to write**: search at task start and before answering questions about past work; record as soon as a durable fact, preference, or decision settles; never record transient chat details.
- SQLite storage on `node:sqlite` (zero native dependencies), with a monotonic `SCHEMA_VERSION` and automatic migration.
- Local embeddings via `@huggingface/transformers` (ONNX, CPU), with per-model task prefixes (`search_document:`/`search_query:` for nomic, `passage:`/`query:` for e5, none for MiniLM/jina), mean pooling, L2 normalization, and an LRU cache.
- Switching to a model with different dimensions shows a **转换索引 (re-embed) button** — stored memories stay untouched until you click it, then migrate in the background with live progress.
- Typert Remote API for the widget: `memory/status`, `memory/models`, `memory/configure`, `memory/search`, `memory/record`, `memory/list`, `memory/listAll`, `memory/cacheStats`, `memory/forget`.

**For the human (client plugin `@deepseek-ai/dsh-client-ui-mem`)**

- A pill button in the top-right header (`conversation.session.header.utilities`): state dot (ready / warming / error) + memory count.
- Panel: backend status, **embedding model selector**, cache tip, quick semantic search with similarity scores, manual record, per-item delete, and a strategy hint.
- A **统计 (stats) button inside the panel header** that opens its own standalone modal: overview cards (total / cache hits / hit rate / cache size), the **full memory list** (paginated, scope tabs 全部/项目/全局, date-sortable) with per-row **add / delete / enable / disable** (disabled memories stay stored but leave search and dedup; shown struck-through with a toggle), and the **embedding cache hit ranking** (sortable by hit count).
- **Fluent animations**: the dot chases while the model warms up, the chip pulses and a toast slides in the moment the AI records or searches (driven by a session projection over `tool/call` events), results stagger in, the cache tip crossfades on model switch. All animations respect `prefers-reduced-motion`.
- UI copy is Chinese (matching the harness), with English fallback via the locale plugin; all styles use the shared `--dsw-*` design tokens (light + dark).

---

## Embedding models

All models run locally on CPU. The two smallest are pre-recommended; every switch that changes dimensions triggers a re-embed with progress.

| Model | Dims | Size | Languages | Recommendation |
|---|---|---|---|---|
| `Xenova/nomic-embed-text-v1` ⭐ | 768 | ~275MB | multilingual | **Default.** opencode-mem's default; best quality for mixed Chinese/English memories, 8192 context |
| `Xenova/all-MiniLM-L6-v2` | 384 | ~23MB ONNX | English | Smallest & fastest; pure-English projects |
| `Xenova/multilingual-e5-small` | 384 | ~120MB | multilingual | Light multilingual alternative |
| `Xenova/jina-embeddings-v2-small-en` | 512 | ~135MB | English | Long-context English |

The selected model is persisted in the SQLite meta table and survives restarts. Models are looked up first in the local cache (`<dsh-home>/storages/mem-models/<model-id>`); the panel's model list offers a **download button** with progress for uncached models (requires huggingface.co access) plus a **hover tooltip** with the manual-download directory and file list.

---

## Quick deploy

One command into your profile (default: `~/.dsh/profiles/web`):

```sh
git clone https://github.com/TenMilesSwordGod/deepseek-harness-mem.git
cd deepseek-harness-mem
./scripts/quick-deploy.sh                 # or: ./scripts/quick-deploy.sh ~/.dsh/profiles/web
```

The script (idempotent — safe to re-run) builds the TypeScript sources when
the `lib/` artifacts are missing, adds both packages to the profile's
`package.json`, registers the two rows in `cordis.patch.yml`, and runs
`pnpm install` (CUDA binaries skipped). Then **restart `dsh web` once**, open
the GUI, refresh, and click **记忆** in the top-right corner. No further
restarts are ever needed.

The repository ships TypeScript sources only (no committed build artifacts);
the first script run downloads the dev dependencies and builds.

---

## Install into a harness profile (manual)

Requirements: Node ≥ 22.5 (uses `node:sqlite`), a DeepSeek Harness profile (this plugin was built against `@deepseek-ai/dsh-*` `0.1.0-rc.6`), pnpm.

1. Install dev dependencies and build both packages from source (or just
   `pnpm install && pnpm build` at the repo root):

   ```sh
   pnpm install
   pnpm build                            # tsc -> lib/ + client bundle
   ```

2. Add both packages to your profile's `package.json` dependencies (for the default web profile:
   `~/.dsh/profiles/web/package.json`):

   ```json
   {
     "dependencies": {
       "@deepseek-ai/dsh-mem": "file:/path/to/deepseek-harness-mem/packages/mem",
       "@deepseek-ai/dsh-client-ui-mem": "file:/path/to/deepseek-harness-mem/packages/client/ui-mem"
     }
   }
   ```

3. Register the rows in the profile's `cordis.patch.yml`:

   ```yaml
   - insert:
       - id: mem
         name: '@deepseek-ai/dsh-mem'
         config:
           embeddingModel: Xenova/nomic-embed-text-v1
           embeddingDimensions: 768
           warmupOnBoot: false
       - id: ui-mem
         name: '@deepseek-ai/dsh-client-ui-mem'
   ```

4. Install and start (the **one-time** restart new packages require):

   ```sh
   cd ~/.dsh/profiles/web
   ONNXRUNTIME_NODE_INSTALL_CUDA=skip pnpm install   # skips unused CUDA binaries
   # restart your dsh web once; afterwards no restarts are needed
   ```

5. Open the web GUI, click **记忆** in the top-right corner.

Optional: pre-download models so first use is offline:

```sh
curl -L -o "<dsh-home>/storages/mem-models/Xenova/nomic-embed-text-v1/onnx/model_quantized.onnx" \
  https://huggingface.co/Xenova/nomic-embed-text-v1/resolve/main/onnx/model_quantized.onnx
# plus config.json, tokenizer.json, tokenizer_config.json, special_tokens_map.json
```

---

## Configuration

All keys live under the `mem` row's `config` (schemastery-validated); `embeddingModel` chosen in the widget persists in the database and wins over the row default.

| Key | Default | Description |
|---|---|---|
| `dbPath` | `<dsh-home>/storages/mem.sqlite` | SQLite path |
| `embeddingModel` | `Xenova/nomic-embed-text-v1` | HF model id from the catalog |
| `embeddingDimensions` | `768` | Used only for non-catalog models |
| `embeddingTaskPrefixes` | `true` | Apply per-model task prefixes |
| `modelCacheDir` | `<dsh-home>/storages/mem-models` | Local model cache root |
| `warmupOnBoot` | `false` | Warm the pipeline at boot instead of first use |
| `recordDedupThreshold` | `0.92` | Skip recording when a near twin scores at/above this |
| `searchMinSimilarity` | `0.3` | Drop search hits below this |
| `searchLimit` | `10` | Default result cap |
| `maxRecordChars` | `4000` | Hard cap per recorded content |
| `activityRingSize` | `8` | Host-side recent-activity ring for the widget |

---

## The agent tools

| Tool | Arguments | Behavior |
|---|---|---|
| `mem_record` | `content`, `tags?`, `scope?` | Embed + store; deduplicates against near twins (`status: "deduplicated"` with similarity) |
| `mem_search` | `query`, `limit?`, `scope?`, `minSimilarity?` | Ranked cosine hits with similarity scores |
| `mem_forget` | `memory_id` | Delete one memory by id |

The system-prompt guidance shipped with the plugin:

- **When to read** — at the start of a task or session; before answering questions about past work, preferences, or decisions; before reworking code you may have already touched.
- **When to write** — as soon as a durable fact settles (a preference, a decision, a non-obvious fix, a convention); after finishing work whose "why" a future session would otherwise have to rediscover.
- **When to forget** — when a memory is outdated or wrong.
- Never record transient conversation details; prefer project scope, use global only for cross-project preferences.

---

## Architecture

```
┌─────────────────────────── host (Node) ───────────────────────────┐
│ @deepseek-ai/dsh-mem                                              │
│  MemService (Typert Remote service, key `memory`)                 │
│   ├─ MemoryStore     node:sqlite · WAL · schema v2 (dims column)  │
│   ├─ EmbeddingService transformers.js · per-model task prefixes   │
│   ├─ tools           mem_record / mem_search / mem_forget         │
│   ├─ 'memory' session projection  (fold over tool/call events)    │
│   ├─ strict Typert host face  (status/models/configure/...)       │
│   └─ background re-embed task on model/dimension switch           │
└───────────────────────────────┬───────────────────────────────────┘
                                │ Typert RPC + session projections
┌─────────────────────────── browser (React 18) ────────────────────┐
│ @deepseek-ai/dsh-client-ui-mem                                    │
│  MemWidget — registered into conversation.session.header.utilities│
│   chip (state dot + count) · toast animations · panel:            │
│   status / model selector + cache tip / quick search / record     │
└───────────────────────────────────────────────────────────────────┘
```

- Storage: `memories(id, content, tags, scope, project, session_id, embedding BLOB, dims, created_at, updated_at)` + `mem_meta` key/value. Search is a cosine over scope-matched candidates in JS — fast for stores up to tens of thousands of rows.
- Live data: the widget animates from the `memory` session projection (last activity + per-kind counts) and polls `memory/status` for warmup / re-embed progress.
- UI composition follows the harness slot system: one entry contributed to the existing header utilities list slot; no shell changes.

---

## Developing without restarting the server

Once installed, both halves hot-reload:

- **Client**: rebuild `lib/client.js` (`node scripts/build-client.mjs`) — the harness `client-hmr` watcher hot-swaps it in the open browser.
- **Host**: stage the rebuilt `lib/` into a fresh `deploy/mem-v<N>` directory and point the profile row at the new file URL:

  ```yaml
  - id: mem
    name: 'file:///absolute/path/deploy/mem-v5/lib/index.js'
  ```

  The loader hot-applies the patch and re-imports the row; a fresh URL bypasses Node's ESM module cache.

---

## Known limitations

- Vector search is brute-force cosine in JS (no ANN index). Fine for the target scale (thousands of memories); revisit with sqlite-vec for large corpora.
- `node:sqlite` is still marked experimental in Node 22 (a startup warning is printed once); the API used is stable in practice.
- No automatic capture from conversation turns (unlike opencode-mem's auto-capture) — the agent records through `mem_record` and the panel, guided by the prompt section.
- First use of a non-cached model requires a network download; the two smallest models are usually pre-provisioned.
- Tool descriptions are English (model-facing); product/UI copy is Chinese (harness convention).

## License

MIT
