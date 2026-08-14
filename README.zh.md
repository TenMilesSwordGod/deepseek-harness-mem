# deepseek-harness-mem

**DeepSeek Harness 的持久语义记忆插件** —— 受 [opencode-mem](https://github.com/tickernelz/opencode-mem) 启发的社区项目。

它给编码 Agent 提供一套基于 SQLite 的持久记忆，用本地 CPU 嵌入模型做语义检索，并在 **Web 界面右上角**加了一个小组件：实时状态、快速语义搜索、一键记录、模型切换 —— AI 每次读写记忆时都有流畅的动画提示。

> 社区项目，与 DeepSeek 官方无关。包名沿用 Harness 的命名约定（`@deepseek-ai/dsh-*`）以便直接接入 profile；这些包**未发布到 npm**。

[English](README.md)

---

## 功能

**给 Agent 用（宿主插件 `@deepseek-ai/dsh-mem`）**

- `mem_record` / `mem_search` / `mem_forget` 三个工具，带去重和 `project` / `global` 作用域（project = 会话所在工作目录树，对应 opencode-mem 的按项目分片）。
- 系统提示引导，明确告诉模型**何时读、何时写**：任务开始时先搜；回答「过去的做法 / 之前的决定」之前先搜；持久事实（偏好、决策、非显而易见的修复、约定）一经落定就记录；绝不记录临时对话细节。
- SQLite 存储（`node:sqlite`，零原生依赖），单调递增 `SCHEMA_VERSION`，自动迁移。
- 本地嵌入（`@huggingface/transformers`，ONNX，CPU），按模型使用正确的任务前缀（nomic 用 `search_document:`/`search_query:`，e5 用 `passage:`/`query:`，MiniLM/jina 不加前缀），mean pooling + L2 归一化 + LRU 缓存。
- 切换到不同维度的模型时会出现**「转换索引」按钮**——存储的记忆保持原样，点击按钮后才在后台批量转换（进度实时可见），转换完成立即可搜。
- 供组件调用的 Typert Remote：`memory/status`、`memory/models`、`memory/configure`、`memory/search`、`memory/record`、`memory/list`、`memory/listAll`、`memory/cacheStats`、`memory/forget`。

**给人用（客户端插件 `@deepseek-ai/dsh-client-ui-mem`）**

- 顶部右上角胶囊按钮（挂载于 `conversation.session.header.utilities`）：状态圆点（就绪/加载中/出错）+ 记忆总数。
- 面板：后端状态、**嵌入模型选择器**、缓存提示、语义快速搜索（带相似度分数）、手动记录、逐条删除、读写策略说明。
- 面板头部内置**「统计」按钮**，点击打开独立弹窗：概览卡片（记忆总数 / 缓存命中 / 命中率 / 缓存占用）、**全部记忆列表**（分页、全部/项目/全局三个筛选页签、按创建时间排序），并且每条记忆支持**新增 / 删除 / 启用 / 停用**（停用的记忆保留在库里，但不再参与检索与去重，列表中以删除线+开关显示）、**嵌入缓存命中排行**（按命中次数可排序）。
- **流畅动画**：模型预热时圆点追逐；AI 记录/搜索的瞬间胶囊脉冲 + 右上角滑入 toast（由 `tool/call` 事件的会话投影驱动）；搜索结果逐条交错入场；切换模型时缓存提示平滑过渡。全部支持 `prefers-reduced-motion` 降级。
- 产品文案为中文（与 Harness 一致），英文兜底；样式全部使用共享 `--dsw-*` 设计令牌（明暗主题自适应）。

---

## 嵌入模型

全部本地 CPU 推理。前两个是主推；切换维度不同的模型会自动触发重建索引（带进度）。

| 模型 | 维度 | 大小 | 语言 | 推荐 |
|---|---|---|---|---|
| `Xenova/nomic-embed-text-v1` ⭐ | 768 | ~275MB | 多语言 | **默认**。opencode-mem 同款默认；中英混合记忆质量最稳，8192 上下文 |
| `Xenova/all-MiniLM-L6-v2` | 384 | ~23MB ONNX | 英文 | 最小最快；纯英文项目首选 |
| `Xenova/multilingual-e5-small` | 384 | ~120MB | 多语言 | 更轻的多语言备选 |
| `Xenova/jina-embeddings-v2-small-en` | 512 | ~135MB | 英文 | 长上下文英文 |

所选模型持久化在 SQLite 元数据表中，重启不丢失。优先从本地缓存目录（`<dsh-home>/storages/mem-models/<模型id>`）加载；面板的模型列表为未缓存模型提供**「下载」按钮**（带进度，需可访问 huggingface.co）与**悬停提示**（含手动下载的目录与文件清单）。

---

## 快速部署

克隆后跑一条命令（默认部署到 `~/.dsh/profiles/web`）：

```sh
git clone https://github.com/TenMilesSwordGod/deepseek-harness-mem.git
cd deepseek-harness-mem
./scripts/quick-deploy.sh                 # 或：./scripts/quick-deploy.sh ~/.dsh/profiles/web
```

脚本（幂等，可重复执行）会：在缺少 `lib/` 构建产物时**自动从 TypeScript
源码构建**（首次会下载开发依赖）、把两个包写进 profile 的 `package.json`
依赖、在 `cordis.patch.yml` 里注册 `mem` 与 `ui-mem` 两行、执行 `pnpm
install`（跳过无用的 CUDA 二进制）。之后**重启一次 `dsh web`**，打开界面
刷新，点击右上角「记忆」即可。此后再也不需要任何重启。

仓库只含 TypeScript 源码（不提交构建产物）。

---

## 安装到 profile（手动）

要求：Node ≥ 22.5（依赖 `node:sqlite`）、一个 DeepSeek Harness profile（本插件基于 `@deepseek-ai/dsh-*` `0.1.0-rc.6` 构建）、pnpm。

1. 安装开发依赖并从源码构建两个包（或在仓库根目录 `pnpm install && pnpm
   build`）：

   ```sh
   pnpm install
   pnpm build                            # tsc -> lib/ + 客户端 bundle
   ```

2. 把两个包加进 profile 的 `package.json` 依赖（默认 Web profile 即
   `~/.dsh/profiles/web/package.json`）：

   ```json
   {
     "dependencies": {
       "@deepseek-ai/dsh-mem": "file:/path/to/deepseek-harness-mem/packages/mem",
       "@deepseek-ai/dsh-client-ui-mem": "file:/path/to/deepseek-harness-mem/packages/client/ui-mem"
     }
   }
   ```

3. 在 profile 的 `cordis.patch.yml` 注册两行：

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

4. 安装并启动（新包所需的**唯一一次**重启）：

   ```sh
   cd ~/.dsh/profiles/web
   ONNXRUNTIME_NODE_INSTALL_CUDA=skip pnpm install   # 跳过无用的 CUDA 二进制
   # 重启一次 dsh web；此后不再需要任何重启
   ```

5. 打开 Web 界面，点击右上角「记忆」。

可选：预先下载模型，首次使用即可离线：

```sh
curl -L -o "<dsh-home>/storages/mem-models/Xenova/nomic-embed-text-v1/onnx/model_quantized.onnx" \
  https://huggingface.co/Xenova/nomic-embed-text-v1/resolve/main/onnx/model_quantized.onnx
# 另外还需 config.json、tokenizer.json、tokenizer_config.json、special_tokens_map.json
```

---

## 配置

所有键都在 `mem` 行的 `config` 下（schemastery 校验）；组件里选择的 `embeddingModel` 持久化在数据库里，优先级高于行内默认值。

| 键 | 默认值 | 说明 |
|---|---|---|
| `dbPath` | `<dsh-home>/storages/mem.sqlite` | SQLite 路径 |
| `embeddingModel` | `Xenova/nomic-embed-text-v1` | 目录内的 HF 模型 id |
| `embeddingDimensions` | `768` | 仅对目录外模型生效 |
| `embeddingTaskPrefixes` | `true` | 按模型应用任务前缀 |
| `modelCacheDir` | `<dsh-home>/storages/mem-models` | 本地模型缓存根目录 |
| `warmupOnBoot` | `false` | 启动即预热，而非首次使用时 |
| `recordDedupThreshold` | `0.92` | 相似度达到该值即去重、不重复记录 |
| `searchMinSimilarity` | `0.3` | 低于该相似度的结果丢弃 |
| `searchLimit` | `10` | 默认返回条数上限 |
| `maxRecordChars` | `4000` | 单条记录内容硬上限 |
| `activityRingSize` | `8` | 供组件展示的最近活动环大小 |

---

## Agent 工具

| 工具 | 参数 | 行为 |
|---|---|---|
| `mem_record` | `content`、`tags?`、`scope?` | 嵌入并存储；与近似重复项去重（返回 `status: "deduplicated"` 及相似度） |
| `mem_search` | `query`、`limit?`、`scope?`、`minSimilarity?` | 按余弦相似度排序返回命中 |
| `mem_forget` | `memory_id` | 按 id 删除一条记忆 |

插件自带的系统提示引导：

- **何时读** —— 任务/会话开始时；回答关于过去工作、偏好、决策的问题之前；动手改可能已经碰过的代码之前。
- **何时写** —— 持久事实一落定就记（偏好、决策、非显而易见的修复、约定）；完成一件「未来会话不查就要重新推导」的工作之后。
- **何时删** —— 记忆过时或错误时。
- 绝不记录临时对话细节；优先 project 作用域，仅跨项目偏好用 global。

---

## 架构

```
┌─────────────────────────── 宿主 (Node) ───────────────────────────┐
│ @deepseek-ai/dsh-mem                                              │
│  MemService（Typert Remote 服务，键 `memory`）                    │
│   ├─ MemoryStore     node:sqlite · WAL · schema v2（dims 列）     │
│   ├─ EmbeddingService transformers.js · 按模型任务前缀            │
│   ├─ tools           mem_record / mem_search / mem_forget         │
│   ├─ 'memory' 会话投影（对 tool/call 事件折叠）                    │
│   ├─ 严格 Typert 宿主 face（status/models/configure/...）         │
│   └─ 模型/维度切换时的后台重建索引任务                             │
└───────────────────────────────┬───────────────────────────────────┘
                                │ Typert RPC + 会话投影
┌─────────────────────────── 浏览器 (React 18) ────────────────────┐
│ @deepseek-ai/dsh-client-ui-mem                                    │
│  MemWidget —— 注册进 conversation.session.header.utilities        │
│   胶囊（状态点+计数）· toast 动画 · 面板：                         │
│   状态 / 模型选择器+缓存提示 / 快速搜索 / 记录                      │
└───────────────────────────────────────────────────────────────────┘
```

- 存储：`memories(id, content, tags, scope, project, session_id, embedding BLOB, dims, created_at, updated_at)` + `mem_meta` 键值表。检索是对作用域内候选做 JS 余弦计算 —— 数万条以内都足够快。
- 实时数据：组件动画由 `memory` 会话投影（最近活动 + 各类计数）驱动，预热/重建进度轮询 `memory/status`。
- UI 组合遵循 Harness 插槽体系：只向已有的头部 utilities 列表插槽贡献一个条目，不改外壳。

---

## 免重启开发流程

装好后两端都能热更新：

- **客户端**：重新构建 `lib/client.js`（`node scripts/build-client.mjs`）—— Harness 的 `client-hmr` 观察者会把它热交换进已打开的浏览器。
- **宿主**：把重新构建的 `lib/` 放进新的 `deploy/mem-v<N>` 目录，并把 profile 行指向新 file URL：

  ```yaml
  - id: mem
    name: 'file:///绝对路径/deploy/mem-v5/lib/index.js'
  ```

  加载器热应用补丁并重新导入该行；新的 URL 绕开 Node 的 ESM 模块缓存。

---

## 已知限制

- 向量检索是 JS 暴力余弦（无 ANN 索引）。目标规模（数千条）足够；量级更大时再考虑 sqlite-vec。
- `node:sqlite` 在 Node 22 仍是实验性标记（启动时打印一次告警）；所用 API 实际已稳定。
- 没有 opencode-mem 那样的对话自动捕捉 —— Agent 通过 `mem_record` 与面板按引导记录。
- 首次使用未缓存的模型需要联网下载；最小的两个模型通常已预置。
- 工具描述为英文（面向模型）；产品/UI 文案为中文（Harness 惯例）。

## License

MIT
