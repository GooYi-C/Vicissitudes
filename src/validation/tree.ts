// src/validation/tree.ts — 变量树形状与 Zod 定义（SK-03 状态核心）
// 树 = 权威状态「现在的事实」（§二十一 S-01）；M-03 写域登记表的三条 authority 根在此就位。
// world.date canonical 单点（SK-03 出口判据）：日期只存在于此处，任何模块不得自建日期源。
// 日期语义：era 年份闭区间 [fromYear, toYear]；其余时间字段半开区间 [from, to) 或 ISO 日期（D-07）。

import { z } from 'zod'

// ── canonical 日期（闭区间 era 语义之外的通用日期一律 ISO）──────────
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO 日期 YYYY-MM-DD')
export const GameYearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '年月 YYYY-MM')
export type GameDate = z.infer<typeof GameYearMonthSchema> // canonical world.date 粒度 = 月

// ── authority 三根（M-03：引擎权威域，Tier 0 永不向模型开放）─────────
export const TerritoryControllerSchema = z.enum(['zhili', 'fengxi', 'zhiyuan', 'guomin', 'ri', 'none'])
export type TerritoryController = z.infer<typeof TerritoryControllerSchema>

// 半开区间 [from, to)（D-07；temporalInterval 库同语义；from < to 强制）
export const HalfOpenIntervalSchema = z
  .object({ from: IsoDateSchema, to: IsoDateSchema })
  .refine((i) => i.from < i.to, { message: '半开区间要求 from < to（首尾相接不重不漏的形状前提）' })
export type HalfOpenInterval = z.infer<typeof HalfOpenIntervalSchema>

export const SettlementClaimSchema = z.object({
  polityId: z.string().min(1),
  controller: TerritoryControllerSchema,
  interval: HalfOpenIntervalSchema, // [from, to) —— 首尾相接不重不漏（DAT-13 同源）
})
export type SettlementClaim = z.infer<typeof SettlementClaimSchema>

export const TerritoryControlSchema = z.object({
  claims: z.array(SettlementClaimSchema), // provinceId → tenure 序列由引擎维护；存档存整树
})
export type TerritoryControl = z.infer<typeof TerritoryControlSchema>

// 待决处境（B-08：入队侧快照 payload，不依赖运行时定义表）
export const PendingSituationSchema = z.object({
  key: z.string().min(1), // situation key（rehydrateDynamicDefs 精确重建依据）
  templateId: z.string().min(1), // ∈ 模板 id ∪ sentinel 'model-proposal'
  payload: z.unknown(), // 快照载荷（往返零丢失断言 EVT-7）
  arrivedAt: IsoDateSchema,
  expiresAt: IsoDateSchema, // 不点即过期（LL-05 玩家裁决层）
})
export type PendingSituation = z.infer<typeof PendingSituationSchema>

export const PendingSituationsSchema = z.object({
  queue: z.array(PendingSituationSchema),
})
export type PendingSituations = z.infer<typeof PendingSituationsSchema>

export const IntelligenceObservationSchema = z.object({
  id: z.string().min(1),
  regionId: z.string().min(1),
  level: z.number().int().min(0).max(3), // 四级情报迷雾
  observedAt: IsoDateSchema,
  expiresAt: IsoDateSchema, // 过期衰减（M-10 intelligence）
})
export const IntelligenceObservationsSchema = z.object({
  observations: z.array(IntelligenceObservationSchema),
})

// ── 变量树主体（SK-03 定案形状；后续批次按模块写域逐域扩充）──────────
export const TreeSchema = z.object({
  world: z.object({
    date: GameYearMonthSchema, // canonical 日期唯一（SK-03 失败判据：grep 不得出现第二处日期源）
  }),
  era: z.object({
    eraId: z.string().min(1), // 出身标签：startGame 一次写入此后只读（M-03）
  }),
  economy: z.object({
    currency: z.string().min(1), // temporal 按日期锚点切换
    commodities: z.record(z.string(), z.object({ price: z.number(), trend: z.number() })), // market 独占
  }),
  _authority: z.object({
    territoryControl: TerritoryControlSchema,
    pendingSituations: PendingSituationsSchema,
    intelligenceObservations: IntelligenceObservationsSchema,
  }),
  // 以下域位 SK-04/SK-05/R 环逐批补（map/trade/settlement/finance/fiscal/
  // war/forces/events/goals/memory/relations/crisis/_computed/career/player/timeline）
})

export type Tree = z.infer<typeof TreeSchema>

// 初始树（startGame 开局命令写入；era 由开局选择一次写入）
export function initialTree(eraId: string, date: GameDate): Tree {
  return TreeSchema.parse({
    world: { date },
    era: { eraId },
    economy: {
      currency: 'yinyuan', // 银元（temporal 按锚点演进）
      commodities: {},
    },
    _authority: {
      territoryControl: { claims: [] },
      pendingSituations: { queue: [] },
      intelligenceObservations: { observations: [] },
    },
  })
}

// 深只读视图类型（B-01 ctx.state 用；运行时由编排器 Object.freeze 递归冻结）
export type ReadonlyTree = {
  readonly world: { readonly date: GameDate }
  readonly era: { readonly eraId: string }
  readonly economy: {
    readonly currency: string
    readonly commodities: Readonly<Record<string, { readonly price: number; readonly trend: number }>>
  }
  readonly _authority: {
    readonly territoryControl: Readonly<TerritoryControl>
    readonly pendingSituations: Readonly<PendingSituations>
    readonly intelligenceObservations: Readonly<z.infer<typeof IntelligenceObservationsSchema>>
  }
}

// __proto__ 防护（DAT-22 三条共用断言之一）：解析前拒绝危险键
export function safeParseTree(raw: unknown): { success: true; data: Tree } | { success: false; error: z.ZodError } {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
  if (/__proto__|constructor|prototype/.test(text ?? '')) {
    // 危险键 → 直接失败，不进 schema（拒载不猜测，S-06）
    return { success: false, error: new z.ZodError([]) }
  }
  return TreeSchema.safeParse(typeof raw === 'string' ? JSON.parse(raw) : raw)
}
