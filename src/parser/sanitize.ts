// src/parser/sanitize.ts — sanitize 与写域白名单（§二十 LL-04）
// EXEMPT:LAYER-005 见 §十六 L-07 豁免表（parser 意图链三段组合，2026-09-15 登记）
// 白名单 = §十八 M-03 写域登记表的投影：登记表扣除 authority 根与引擎独占域后的
// 剩余主角级域 + memory.items（单轮 +3）。仓库中不存在第二份手写 AI 可写域清单（MOD-6 两侧）。
// Tier 0（LL-06）：authority 路径的 set 一律剥除，先于幅度校验，无豁免。
// 剥除逐 op 进行（不是整块拒绝）；越界剥除 + 注记，回合继续。

import type { JsonPatchOp } from '../validation/effects'

// ── M-03 写域登记表（单一事实源的结构化投影；改域 = 先改 M-03，本清单自动跟随）──
// 全部登记行（M-03 表逐行）：
const M03_REGISTRY = {
  'world.date': { tier: 'engine-exclusive' },
  era: { tier: 'engine-exclusive' }, // 开局一次写此后只读
  'economy.currency': { tier: 'engine-exclusive' },
  '_authority.territoryControl': { tier: 'authority' },
  '_authority.pendingSituations': { tier: 'authority' },
  '_authority.intelligenceObservations': { tier: 'authority' },
  'economy.commodities': { tier: 'engine-exclusive' }, // market 独占（Tier 0）
  'trade.route': { tier: 'engine-exclusive' },
  settlement: { tier: 'engine-exclusive' },
  finance: { tier: 'engine-exclusive' },
  fiscal: { tier: 'engine-exclusive' },
  war: { tier: 'engine-exclusive' }, // 含 siegeWarnings 台账
  forces: { tier: 'engine-exclusive' }, // 势力兵力（与 career.forces 分域）
  events: { tier: 'engine-exclusive' }, // eventCD / resolvedEvents 台账
  map: { tier: 'engine-exclusive' }, // 城市六维（链②）
  career: { tier: 'player' }, // 主角级：命令层 + aftermath
  player: { tier: 'player' },
  'memory.items': { tier: 'player', memoryOps: 3 }, // 链③：单轮 +3
  timeline: { tier: 'engine-exclusive' },
  goals: { tier: 'engine-exclusive' },
  crisis: { tier: 'engine-exclusive' },
  relations: { tier: 'engine-exclusive' },
  '_computed.labor': { tier: 'engine-exclusive' },
} as const

export type DomainTier = 'authority' | 'engine-exclusive' | 'player'

// 白名单生成（LL-04 不变量 1：由表生成，不手写第二份清单）
export function buildDomainWhitelist(): { paths: ReadonlySet<string>; memoryOpsPerTurn: 3 } {
  const paths = new Set<string>()
  for (const [domain, def] of Object.entries(M03_REGISTRY)) {
    if (def.tier === 'player') paths.add(domain) // 主角级域 + memory.items
  }
  return { paths, memoryOpsPerTurn: 3 }
}

export interface Rejection {
  path: string
  reason: 'tier0' | 'not-whitelisted' | 'memory-quota'
  detail: string
}

export interface SanitizeResult {
  accepted: JsonPatchOp[]
  rejected: Rejection[]
}

// 路径 → 域键：按 M-03 登记行的**最长注册前缀**匹配（如 /career/money → career，
// /memory/items/x → memory.items；/map/c/dim → map）。登记表是域键全集。
function domainOf(path: string): string {
  const segs = path.split('/').filter(Boolean)
  const candidates: string[] = []
  if (segs[0] === '_authority' && segs.length >= 2) candidates.push(`_authority.${segs[1]}`)
  if (segs.length >= 2) candidates.push(`${segs[0]}.${segs[1]}`)
  if (segs.length >= 1) candidates.push(segs[0])
  // 最长前缀优先（memory.items 优先于 memory；_authority.x 优先于 _authority）
  for (const c of candidates) {
    if (c in M03_REGISTRY) return c
  }
  return candidates[candidates.length - 1] ?? ''
}

function tierOf(domain: string): DomainTier | undefined {
  const def = (M03_REGISTRY as Record<string, { tier: DomainTier } | undefined>)[domain]
  return def?.tier
}

// Tier 0 判定（LL-06 六项）：authority 全体 + 引擎独占域 —— 一律剥除，先于幅度
function isTier0(domain: string): boolean {
  const tier = tierOf(domain)
  return tier === 'authority' || tier === 'engine-exclusive'
}

export function sanitize(
  ops: readonly JsonPatchOp[],
  wl: { paths: ReadonlySet<string>; memoryOpsPerTurn: number },
): SanitizeResult {
  const accepted: JsonPatchOp[] = []
  const rejected: Rejection[] = []
  let memoryOps = 0
  for (const op of ops) {
    const domain = domainOf(op.path)
    // Tier 0 拦截先于一切（LL-06 不变量 2：不是幅度够小就放行）
    if (isTier0(domain)) {
      rejected.push({ path: op.path, reason: 'tier0', detail: `Tier 0 域 ${domain} 永不开放（LL-06）` })
      continue
    }
    // 白名单判定（主角级域）
    if (!wl.paths.has(domain)) {
      rejected.push({ path: op.path, reason: 'not-whitelisted', detail: `域 ${domain} 不在 AI 可写白名单（M-03 投影）` })
      continue
    }
    // memory.items 单轮 +3（超限剥除并注记；引擎保底 importance≥7 不走本通道）
    if (domain === 'memory.items') {
      memoryOps += 1
      if (memoryOps > wl.memoryOpsPerTurn) {
        rejected.push({ path: op.path, reason: 'memory-quota', detail: `单轮记忆写入超 +3（第 ${memoryOps} 条）` })
        continue
      }
    }
    accepted.push(op) // 序保持，不重排（LL-04 确定性）
  }
  return { accepted, rejected }
}

// MOD-6 / LLM-16 一致性断言用：白名单投影（供测试与 M-03 表交叉校验）
export function whitelistProjection(): readonly string[] {
  return [...buildDomainWhitelist().paths].sort()
}
