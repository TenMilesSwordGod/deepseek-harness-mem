/**
 * Widget dictionaries: Chinese is the source-of-truth key set (product copy
 * is Chinese), English is the fallback translation.
 * @module @deepseek-ai/dsh-client-ui-mem
 */
export declare const zh: {
    readonly title: "记忆";
    readonly panelTitle: "记忆系统";
    readonly ready: "就绪";
    readonly notReady: "未就绪";
    readonly warming: "模型加载中";
    readonly warmingDetail: "正在下载嵌入模型，首次使用需要片刻…";
    readonly error: "加载失败";
    readonly count: "条记忆";
    readonly model: "模型";
    readonly modelSelect: "嵌入模型";
    readonly cached: "本地";
    readonly notCached: "需下载";
    readonly reembedding: "重建索引中";
    readonly cacheTipLocal: "已缓存本地";
    readonly cacheTipRemote: "首次使用需联网下载";
    readonly cacheTipDims: "维";
    readonly cacheTipMultilingual: "多语言";
    readonly cacheTipCpu: "CPU 即可流畅推理";
    readonly strategyTip: "AI 会在任务开始时自动搜索相关记忆，并在产生值得复用的结论时自动记录";
    readonly database: "数据库";
    readonly searchPlaceholder: "搜索记忆…";
    readonly searchEmpty: "没有匹配的记忆";
    readonly searchHint: "语义搜索：输入关键词或描述";
    readonly recordPlaceholder: "记下一条值得复用的记忆…";
    readonly recordButton: "保存";
    readonly forget: "删除";
    readonly recorded: "已记录";
    readonly searched: "搜索记忆";
    readonly forgot: "已删除";
    readonly dedup: "与已有记忆相似，已合并";
    readonly scopeProject: "当前项目";
    readonly scopeGlobal: "全局";
    readonly activityTitle: "记忆活动";
    readonly open: "打开记忆面板";
};
export type MemKey = keyof typeof zh;
export declare const en: Record<MemKey, string>;
