/**
 * The memory service (`ctx.memory`): SQLite-backed semantic memory with
 * model-facing tools, a Typert Remote face for the browser widget, and a
 * session projection that drives the widget's activity animation.
 *
 * Referenced prior art: opencode-mem (local embeddings, record/search tools,
 * per-project scoping); this port keeps that shape on node:sqlite and the
 * DeepSeek Harness plugin seams.
 * @module @deepseek-ai/dsh-mem
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { realpathSync } from 'node:fs';
import { Config, resolveConfig } from './config.js';
import { EmbeddingService } from './embedding.js';
import { MemoryStore } from './store.js';
import { MEM_MODELS, catalogModel } from './models.js';
import { MEMORY_TYPERT_HOST } from './typert.js';
import { applyMemFold, initMemFold, memProjectionSchema } from './projection.js';
/** Validate one wire-provided scope string. @throws on unknown values. */
function resolveScope(value, fallback) {
    if (value === undefined)
        return fallback;
    if (value === 'project' || value === 'global')
        return value;
    throw new Error(`invalid memory scope ${JSON.stringify(String(value))}; expected 'project' or 'global'`);
}
/** Canonical project key for one session's cwd; null when unresolvable. */
function projectOf(session) {
    const cwd = session?.header.cwd;
    if (cwd === undefined)
        return null;
    try {
        return realpathSync(cwd);
    }
    catch {
        return cwd;
    }
}
/** Normalize a comma-separated tag string into lowercase storage form. */
function normalizeTags(raw) {
    if (typeof raw !== 'string')
        return '';
    return raw
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag !== '')
        .slice(0, 12)
        .join(',');
}
/** Model-facing guidance section (English, mirroring opencode-mem's intent). */
const MEMORY_GUIDANCE = [
    'You have persistent semantic memory through three tools. Read and write it at the right moments.',
    '',
    'WHEN TO READ (mem_search):',
    '- At the start of a task or session, search for related past work, conventions, and decisions before acting.',
    '- Before answering questions about past work, preferences, or "what did we decide" — search with specific technical keywords.',
    '- Before reworking code or files you may have already worked on; check memory first instead of re-deriving.',
    '',
    'WHEN TO WRITE (mem_record):',
    '- As soon as a durable fact settles: a user preference, a design decision, a non-obvious fix, a convention.',
    '- After completing a piece of work whose "why" a future session would otherwise have to rediscover.',
    '- Record concisely and self-contained; prefer stable facts over one-off details.',
    '',
    'WHEN TO FORGET (mem_forget): when a stored memory is outdated or wrong, remove it by its id.',
    '',
    'Do NOT record every interaction or transient conversation details — only what would help a future session.',
    'Memories are scoped: "project" stores into the current working-directory tree (the default), "global" applies everywhere. Prefer project scope; use global only for cross-project user preferences.',
].join('\n');
/** Tool-pair presentation: a generic card titled in the product language. */
function present(title, rawInput) {
    return {
        card: 'generic',
        title,
        kind: 'other',
        rawInput: rawInput.slice(0, 400),
    };
}
/** Wire-validated bounded integer. @throws on non-numbers. */
function resolveLimit(value, fallback, max) {
    if (value === undefined)
        return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error('limit must be a number');
    return Math.max(1, Math.min(max, Math.floor(value)));
}
/** Wire-validated similarity bound. @throws on non-numbers. */
function resolveSimilarity(value, fallback) {
    if (value === undefined)
        return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error('minSimilarity must be a number');
    return Math.max(0, Math.min(1, value));
}
/** Wire-validated non-empty string. @throws on empty or non-string. */
function resolveText(value, name, maxChars) {
    if (typeof value !== 'string' || value.trim() === '')
        throw new Error(`${name} must be a non-empty string`);
    return value.trim().slice(0, maxChars);
}
/**
 * Persistent semantic memory service. Loader row id `mem`; the browser widget
 * talks to it through the `memory` Remote namespace.
 */
let MemService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _status_decorators;
    let _models_decorators;
    let _configure_decorators;
    let _search_decorators;
    let _record_decorators;
    let _list_decorators;
    let _forget_decorators;
    return class MemService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _status_decorators = [Remote('status')];
            _models_decorators = [Remote('models')];
            _configure_decorators = [Remote('configure')];
            _search_decorators = [Remote('search')];
            _record_decorators = [Remote('record')];
            _list_decorators = [Remote('list')];
            _forget_decorators = [Remote('forget')];
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _models_decorators, { kind: "method", name: "models", static: false, private: false, access: { has: obj => "models" in obj, get: obj => obj.models }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _configure_decorators, { kind: "method", name: "configure", static: false, private: false, access: { has: obj => "configure" in obj, get: obj => obj.configure }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _record_decorators, { kind: "method", name: "record", static: false, private: false, access: { has: obj => "record" in obj, get: obj => obj.record }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _forget_decorators, { kind: "method", name: "forget", static: false, private: false, access: { has: obj => "forget" in obj, get: obj => obj.forget }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['agents', 'tools', 'systemPrompt'];
        static Config = Config;
        config = __runInitializers(this, _instanceExtraInitializers);
        store;
        embedding;
        /** TS-private on purpose: @Remote methods run with the cordis proxy as
         *  `this`, which cannot read ECMAScript #private members. */
        activityRing = [];
        reembedState = null;
        reembedVersion = 0;
        constructor(ctx, config = {}) {
            super(ctx, 'memory');
            this.config = resolveConfig(config);
            this.store = new MemoryStore(this.config.dbPath);
            const persistedModel = this.store.metaGet('embedding_model');
            const model = typeof persistedModel === 'string' && persistedModel !== ''
                ? persistedModel
                : this.config.embeddingModel;
            this.embedding = new EmbeddingService(model, catalogModel(model)?.dims ?? this.config.embeddingDimensions, this.config.modelCacheDir, this.config.embeddingTaskPrefixes);
            if (this.config.warmupOnBoot) {
                void this.embedding.warmup().catch(() => {
                    // Status surface reports the warmup error; boot must not fail on it.
                });
            }
            ctx.inject(['sessionProjections'], (projectionCtx) => {
                projectionCtx.sessionProjections.register({
                    key: 'memory',
                    schema: memProjectionSchema,
                    init: initMemFold,
                    apply: applyMemFold,
                    view: (state) => state,
                    stateVersion: 1,
                });
            });
            // Strict host face: the gateway dispatches memory/* through the typed
            // registry, so endpoint claims never depend on cached source markers.
            ctx.inject(['typert'], (typertCtx) => {
                typertCtx.typert.register(MEMORY_TYPERT_HOST);
            });
            this.#registerTools(ctx);
            ctx.systemPrompt.section({
                name: 'memory',
                order: 92,
                text: MEMORY_GUIDANCE,
            });
        }
        /** Append one activity to the ring and return the new head. */
        pushActivity(kind, text) {
            const activity = { kind, text: text.slice(0, 140), at: Date.now() };
            this.activityRing.unshift(activity);
            if (this.activityRing.length > this.config.activityRingSize)
                this.activityRing.pop();
            return activity;
        }
        #registerTools(ctx) {
            const tools = ctx.tools;
            const service = this;
            tools.register(defineTool({
                name: 'mem_record',
                description: 'Record a durable semantic memory for this workspace. Use for stable facts, decisions, conventions, or preferences worth reusing in future sessions. The system deduplicates near-identical memories automatically.',
                parameters: {
                    content: {
                        type: 'string',
                        required: true,
                        description: 'The memory text to store. Concise and self-contained.',
                    },
                    tags: {
                        type: 'string',
                        description: 'Optional comma-separated lowercase technical keywords that improve search ranking.',
                    },
                    scope: {
                        type: 'string',
                        enum: ['project', 'global'],
                        description: "'project' (default) scopes to the current working-directory tree; 'global' applies to every workspace.",
                    },
                },
                output: {
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            status: { type: 'string', enum: ['recorded', 'deduplicated'], required: true },
                            id: { type: 'string', required: true },
                            similarity: { type: 'number' },
                            count: { type: 'number', required: true },
                        },
                    },
                    render: (_args, value) => [{
                            type: 'text',
                            text: value.status === 'recorded'
                                ? `memory recorded (${value.id}); ${value.count} total`
                                : `deduplicated against ${value.id} (similarity ${(value.similarity ?? 0).toFixed(3)}); ${value.count} total`,
                        }],
                },
                async execute(args, exec) {
                    const content = resolveText(args.content, 'content', service.config.maxRecordChars);
                    const scope = resolveScope(args.scope, 'project');
                    const project = scope === 'global' ? null : projectOf(exec.agent?.session);
                    const embedding = await service.embedding.embed(content, 'document');
                    const result = service.store.record(content, normalizeTags(args.tags), scope, project, exec.agent?.session.id ?? null, embedding, service.embedding.dimensions, service.config.recordDedupThreshold);
                    service.pushActivity('record', content);
                    return {
                        status: result.status,
                        id: result.id,
                        ...(result.similarity === undefined ? {} : { similarity: result.similarity }),
                        count: service.store.count(),
                    };
                },
                presentCall: (args) => present('记忆 · 记录', args.content),
            }));
            tools.register(defineTool({
                name: 'mem_search',
                description: 'Search persistent memories by semantic similarity. Use before answering questions about past work, conventions, or decisions. Returns ranked hits with similarity scores.',
                parameters: {
                    query: {
                        type: 'string',
                        required: true,
                        description: 'Search text; specific technical keywords rank best.',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum results to return (default 10, max 20).',
                    },
                    scope: {
                        type: 'string',
                        enum: ['project', 'global'],
                        description: "'project' (default) searches the current working-directory tree plus global; 'global' searches everything.",
                    },
                    minSimilarity: {
                        type: 'number',
                        description: 'Minimum similarity 0..1 to include a hit (default 0.3).',
                    },
                },
                output: {
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            results: {
                                type: 'array',
                                required: true,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        id: { type: 'string', required: true },
                                        content: { type: 'string', required: true },
                                        tags: { type: 'string', required: true },
                                        scope: { type: 'string', enum: ['project', 'global'], required: true },
                                        similarity: { type: 'number', required: true },
                                        createdAt: { type: 'number', required: true },
                                    },
                                },
                            },
                        },
                    },
                    render: (args, value) => [{
                            type: 'text',
                            text: value.results.length === 0
                                ? 'no memories matched'
                                : value.results.map((hit, index) => `${index + 1}. [${hit.similarity.toFixed(3)}] ${hit.content}`).join('\n'),
                        }],
                },
                async execute(args, exec) {
                    const query = resolveText(args.query, 'query', 1000);
                    const scope = resolveScope(args.scope, 'project');
                    const project = scope === 'global' ? null : projectOf(exec.agent?.session);
                    const embedding = await service.embedding.embed(query, 'query');
                    const results = service.store.search(embedding, scope, project, service.embedding.dimensions, resolveLimit(args.limit, service.config.searchLimit, 20), resolveSimilarity(args.minSimilarity, service.config.searchMinSimilarity));
                    service.pushActivity('search', query);
                    return { results, scope, project };
                },
                presentCall: (args) => present('记忆 · 搜索', args.query),
            }));
            tools.register(defineTool({
                name: 'mem_forget',
                description: 'Delete one memory by its id (from mem_search results or mem_record). Use when a stored memory is outdated or wrong.',
                parameters: {
                    memory_id: {
                        type: 'string',
                        required: true,
                        description: 'The memory id to delete.',
                    },
                },
                output: {
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            forgotten: { type: 'boolean', required: true },
                            count: { type: 'number', required: true },
                        },
                    },
                    render: (_args, value) => [{
                            type: 'text',
                            text: value.forgotten ? `memory forgotten; ${value.count} total` : 'memory id not found',
                        }],
                },
                async execute(args) {
                    const id = resolveText(args.memory_id, 'memory_id', 200);
                    const forgotten = service.store.forget(id);
                    if (forgotten)
                        service.pushActivity('forget', id);
                    return { forgotten, count: service.store.count() };
                },
                presentCall: (args) => present('记忆 · 遗忘', args.memory_id),
            }));
        }
        /** Whole status snapshot for the widget header. */
        status() {
            return {
                ready: this.embedding.ready,
                model: this.embedding.model,
                dimensions: this.embedding.dimensions,
                dbPath: this.store.dbPath,
                count: this.store.count(),
                staleCount: this.store.staleCount(this.embedding.dimensions),
                lastActivity: this.activityRing[0] ?? null,
                warmup: this.embedding.warmupState,
                reembed: this.reembedState,
            };
        }
        /** Catalog plus local-cache flags, and the active model. */
        models() {
            return {
                catalog: MEM_MODELS.map((entry) => ({ ...entry, cached: this.embedding.isCachedFor(entry.id) })),
                current: this.embedding.model,
            };
        }
        /**
         * Switch the active embedding model; a dimension change starts a background
         * re-embed of stored rows. Persisted in the SQLite meta table so the choice
         * survives restarts and wins over the cordis config default.
         */
        async configure(request) {
            const model = resolveText(request.model, 'model', 200);
            const entry = catalogModel(model);
            if (entry === undefined)
                throw new Error(`unknown embedding model ${JSON.stringify(model)}`);
            const dimensionsChanged = entry.dims !== this.embedding.dimensions || model !== this.embedding.model;
            this.embedding.switchModel(model, entry.dims);
            this.store.metaSet('embedding_model', model);
            let reembedding = false;
            if (dimensionsChanged) {
                reembedding = true;
                void this.startReembed(model);
            }
            return { model, dimensions: entry.dims, reembedding };
        }
        /**
         * Background re-embed task: every row stored under foreign dimensions is
         * re-embedded with the active model. A newer configure cancels the loop.
         * @param model - model id this task belongs to (stale tasks stop early).
         */
        async startReembed(model) {
            const version = ++this.reembedVersion;
            const stale = this.store.staleCount(this.embedding.dimensions);
            if (stale === 0) {
                this.reembedState = null;
                return;
            }
            this.reembedState = { state: 'running', done: 0, total: stale };
            try {
                await this.store.reEmbedAll(this.embedding.dimensions, (text) => this.embedding.embed(text, 'document'), (done, total) => {
                    if (this.reembedVersion === version) {
                        this.reembedState = { state: 'running', done, total };
                    }
                }, () => this.reembedVersion !== version);
                if (this.reembedVersion === version) {
                    this.reembedState = this.store.staleCount(this.embedding.dimensions) === 0 ? null : { state: 'done', done: 0, total: 0 };
                }
            }
            catch (error) {
                // Re-embed failure surfaces via warmup/status; clear the stuck task so
                // the widget's progress bar does not spin forever.
                if (this.reembedVersion === version)
                    this.reembedState = null;
            }
        }
        /** Quick search from the widget; the agent's session supplies the project key. */
        async search(agent, request) {
            const query = resolveText(request.query, 'query', 1000);
            const scope = resolveScope(request.scope, 'project');
            const project = scope === 'global' ? null : projectOf(agent.session);
            const embedding = await this.embedding.embed(query, 'query');
            const results = this.store.search(embedding, scope, project, this.embedding.dimensions, resolveLimit(request.limit, this.config.searchLimit, 20), resolveSimilarity(request.minSimilarity, this.config.searchMinSimilarity));
            this.pushActivity('search', query);
            return { results, scope, project };
        }
        /** Manual record from the widget. */
        async record(agent, request) {
            const content = resolveText(request.content, 'content', this.config.maxRecordChars);
            const scope = resolveScope(request.scope, 'project');
            const project = scope === 'global' ? null : projectOf(agent.session);
            const embedding = await this.embedding.embed(content, 'document');
            const result = this.store.record(content, normalizeTags(request.tags), scope, project, agent.session.id, embedding, this.embedding.dimensions, this.config.recordDedupThreshold);
            this.pushActivity('record', content);
            return {
                status: result.status,
                id: result.id,
                ...(result.similarity === undefined ? {} : { similarity: result.similarity }),
                count: this.store.count(),
            };
        }
        /** Recent memories for the widget panel. */
        list(agent, request) {
            const scope = resolveScope(request.scope, 'project');
            const project = scope === 'global' ? null : projectOf(agent.session);
            return {
                items: this.store.list(scope, project, resolveLimit(request.limit, 20, 100)),
            };
        }
        /** Delete one memory from the widget panel. */
        forget(request) {
            const id = resolveText(request.id, 'id', 200);
            const forgotten = this.store.forget(id);
            if (forgotten)
                this.pushActivity('forget', id);
            return { forgotten, count: this.store.count() };
        }
    };
})();
export { MemService };
export default MemService;
