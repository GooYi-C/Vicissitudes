// EXEMPT:LAYER-008
// src/llm/errors.ts — LL-19 错误与降级语义统一表（客户端侧定义处；functions/ 代理侧同表）
// 分类码封闭枚举——不设 other 桶（LL-19 不变量 1）；新增场景必须先改 §二十 LL-19 表。
// 每类写明「世界影响」；降级不产生机制效果：模型失败 ≠ 游戏惩罚（LL-19 不变量 3/4）。
// 确定性要求：同响应 → 同分类（纯函数；不依赖时间、不依赖调用序）。

export type LlmErrorCode =
  | 'no-provider'      // 未配置 API（零调用地板；不发请求）
  | 'auth'             // 401/403：密钥无效或被拒（本回合不重试）
  | 'rate'             // 429 限流（不自动重试——防加倍计费）
  | 'upstream'         // 上游 5xx（连接层重试 ≤1 次）
  | 'timeout'          // 首字节 30s（不重试，走规则路径）
  | 'stream-broken'    // 流中断（不重试；已收结构块照常处理 —— LL-02 不变量 1）
  | 'blocked-upstream' // SSRF/非 https（不发请求）
  | 'bad-block'        // 结构块坏/未知标签（丢该块 + diagnostic）
  | 'proposal-rejected'// 提议非法（超幅/越界/超 ops 整块丢弃）
  | 'rejected'         // 命令越权/资源不足（拒绝 + diagnostic）
  | 'embed-off'        // embedding 未配置（零打扰，不是错误）
  | 'embed-fallback'   // embedding 探测失败/超时（本回合规则回退）
  | 'index-stale'      // 索引与模型不匹配（强制提示重建）

export interface LlmErrorSpec {
  code: LlmErrorCode
  playerMessage: string // 玩家可见行为摘要（零打扰项为空串）
  worldImpact: 'none' | 'partial-received' // 已收块按契约落账属部分，其余全零
}

// 统一表（LL-19 四列：分类码 / 玩家可见行为 / 引擎行为 / 世界影响 —— 引擎行为散在调用处，世界影响在此断言）
export const LLM_ERROR_TABLE: Readonly<Record<LlmErrorCode, LlmErrorSpec>> = Object.freeze({
  'no-provider': { code: 'no-provider', playerMessage: '当前为确定性模式（未配置 API）', worldImpact: 'none' },
  auth: { code: 'auth', playerMessage: '密钥无效或被拒，请到设置检查配置', worldImpact: 'none' },
  rate: { code: 'rate', playerMessage: '上游限流，请稍后再试', worldImpact: 'none' },
  upstream: { code: 'upstream', playerMessage: '上游故障，已按规则路径继续', worldImpact: 'none' },
  timeout: { code: 'timeout', playerMessage: '回复超时，已按规则路径继续', worldImpact: 'none' },
  'stream-broken': { code: 'stream-broken', playerMessage: '回复中断，已收到部分照常处理', worldImpact: 'partial-received' },
  'blocked-upstream': { code: 'blocked-upstream', playerMessage: '端点不被允许', worldImpact: 'none' },
  'bad-block': { code: 'bad-block', playerMessage: '', worldImpact: 'none' },
  'proposal-rejected': { code: 'proposal-rejected', playerMessage: '', worldImpact: 'none' },
  rejected: { code: 'rejected', playerMessage: '指令被拒绝', worldImpact: 'none' },
  'embed-off': { code: 'embed-off', playerMessage: '', worldImpact: 'none' },
  'embed-fallback': { code: 'embed-fallback', playerMessage: '', worldImpact: 'none' },
  'index-stale': { code: 'index-stale', playerMessage: '', worldImpact: 'none' },
})

// 封闭枚举穷尽性锚点（LLM-27 静态断言对象）：key 数 = 表中行数
export const LLM_ERROR_CODES: readonly LlmErrorCode[] = Object.freeze(Object.keys(LLM_ERROR_TABLE)) as readonly LlmErrorCode[]

/** HTTP 状态 → 分类码（纯函数；上游 2xx 由调用方处理，此处只管失败） */
export function classifyHttpFailure(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate'
  if (status >= 500) return 'upstream'
  return 'rejected' // 400/4xx 其它：走统一拒绝面（不回传原始上游 body —— LL-10 不变量 5）
}

/** 代理结构化错误体的 code 直通（代理已按 LL-19 分类；客户端只消费不自创） */
export function normalizeProxyCode(code: unknown): LlmErrorCode | null {
  return typeof code === 'string' && (LLM_ERROR_CODES as readonly string[]).includes(code)
    ? (code as LlmErrorCode)
    : null
}
