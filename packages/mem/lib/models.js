/**
 * Built-in embedding model catalog: small ONNX models that infer on CPU,
 * mirroring opencode-mem's local-model menu. Dimensions are fixed per model;
 * switching models with different dimensions triggers a background re-embed.
 * @module @deepseek-ai/dsh-mem
 */
/** Default model: opencode-mem's default, balanced quality/size. */
export const DEFAULT_MEM_MODEL = 'Xenova/nomic-embed-text-v1';
/**
 * Catalog ordered lightest-first. The two smallest entries are the
 * recommended CPU-friendly choices; the rest are selectable for quality.
 */
export const MEM_MODELS = [
    {
        id: 'Xenova/all-MiniLM-L6-v2',
        dims: 384,
        label: 'all-MiniLM-L6-v2',
        desc: '最小模型（~90MB），CPU 推理最快，英文为主',
        sizeMb: 90,
        multilingual: false,
        taskPrefixes: 'none',
    },
    {
        id: 'Xenova/nomic-embed-text-v1',
        dims: 768,
        label: 'nomic-embed-text-v1',
        desc: 'opencode-mem 默认模型（~275MB），多语言，8192 上下文',
        sizeMb: 275,
        multilingual: true,
        taskPrefixes: 'nomic',
    },
    {
        id: 'Xenova/jina-embeddings-v2-small-en',
        dims: 512,
        label: 'jina-embeddings-v2-small-en',
        desc: '轻量英文模型（~135MB），8192 上下文',
        sizeMb: 135,
        multilingual: false,
        taskPrefixes: 'none',
    },
    {
        id: 'Xenova/multilingual-e5-small',
        dims: 384,
        label: 'multilingual-e5-small',
        desc: '轻量多语言模型（~120MB）',
        sizeMb: 120,
        multilingual: true,
        taskPrefixes: 'e5',
    },
];
/**
 * Look up a catalog entry by model id.
 * @param id - Hugging Face model id.
 * @returns the entry, or undefined when the id is not in the catalog.
 */
export function catalogModel(id) {
    return MEM_MODELS.find((model) => model.id === id);
}
