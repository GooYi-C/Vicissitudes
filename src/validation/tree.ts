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
// 玩家控制器（R3：OccupationCommand 落 claim 的 controller 值 —— M-03 链①第三写者）
export const TerritoryControllerSchema = z.enum(['zhili', 'fengxi', 'zhiyuan', 'guomin', 'ri', 'player', 'none'])
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
// §8.6 DynamicEventPayload 快照：title/desc/options/when 全量随处境入档 ——
// 库升级不影响旧档待决处境；模板侧 templateId ∈ 模板 id ∪ sentinel 'model-proposal'
export const DynamicEventPayloadSchema = z.object({
  version: z.number().int().min(1),
  title: z.string().min(1),
  desc: z.string().min(1),
  options: z.array(z.object({ text: z.string().min(1), effects: z.array(z.unknown()) })).min(1),
  tags: z.array(z.string()).min(1),
})
export type DynamicEventPayload = z.infer<typeof DynamicEventPayloadSchema>

export const PendingSituationSchema = z.object({
  key: z.string().min(1), // situation key（rehydrateDynamicDefs 精确重建依据）
  templateId: z.string().min(1), // ∈ 事件/模板 id ∪ sentinel 'model-proposal'
  payload: DynamicEventPayloadSchema, // 快照载荷（往返零丢失断言 EVT-7）
  arrivedAt: IsoDateSchema,
  expiresAt: IsoDateSchema, // 不点即过期（LL-05 玩家裁决层）
})
export type PendingSituation = z.infer<typeof PendingSituationSchema>

export const PendingSituationsSchema = z.object({
  // record 键 = situation key（B-09-2 ResolveRef 精确命中 + 去重 key 单通道 —— §7.4d）
  queue: z.record(z.string(), PendingSituationSchema),
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

// ── R1 经济环域（§9.2–9.6；S-01 同源：写入即 TurnRunner 提交后整份状态）────

// market 行情行（B-03：market 独占；price = 全国中价锚，单位为担/箱等 L0-06 单位）
export const CommodityQuoteSchema = z.object({
  price: z.number().finite().nonnegative(), // 全国中价（银元）
  trend: z.number().finite(), // 环比 %（上扬为正）；首月 = 0
})
export type CommodityQuote = z.infer<typeof CommodityQuoteSchema>

// trade 商路（§9.3：状态机 通行/停运/中断；saturation 落账 —— CareerPanel「压住行情 N%」）
export const RouteStateEnum = z.enum(['open', 'suspended', 'severed'])
export type RouteState = z.infer<typeof RouteStateEnum>

export const TradeRouteSchema = z.object({
  id: z.string().min(1),
  commodityId: z.string().min(1),
  origin: z.string().min(1), // 城市表 id
  dest: z.string().min(1),
  lineId: z.string().min(1), // L0-05 线路 id
  volume: z.number().int().nonnegative(), // 装载量（单位 = 商品单位）
  monthlyTrips: z.number().int().nonnegative(),
  state: RouteStateEnum, // 沦陷自动中断接 R3 history 钩子
  saturation: z.number().min(0).max(1).default(0), // 上月饱和度落账（§9.3）
  capital: z.number().nonnegative().default(0), // 垫资（≈ volume × freight，E-1.4）
})
export type TradeRoute = z.infer<typeof TradeRouteSchema>

export const TradeSchema = z.object({
  routes: z.record(z.string(), TradeRouteSchema), // routeId → 路线账
})
export type Trade = z.infer<typeof TradeSchema>

// settlement 现金账（E-1.2 八身份月收支带 → 引擎侧过账；三件套之一）
export const LedgerEntrySchema = z.object({
  month: GameYearMonthSchema, // 过账月（canonical 口径）
  amount: z.number().finite(), // 净额（收入为正）
  what: z.string().min(1),
})
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>

export const SettlementSchema = z.object({
  cash: z.number().finite(), // 现金（银元；玩家账本唯一现金口径 —— E-1.2 结余落此）
  ledger: z.array(LedgerEntrySchema), // 月度流水（append-only）
})
export type Settlement = z.infer<typeof SettlementSchema>

// finance 实业（E-1.4：月净收益率 3–6% 繁荣加权；升级成本 ×1.8 收益 ×1.5）
export const FinanceBizSchema = z.object({
  bizId: z.string().min(1), // L0-07 实业 id
  cityId: z.string().min(1),
  level: z.number().int().min(1).max(3),
  capital: z.number().nonnegative(), // 已投本金
  lastProfit: z.number().finite().default(0), // 上月净利（资金链压力源之一）
})
export type FinanceBiz = z.infer<typeof FinanceBizSchema>

export const FinanceSchema = z.object({
  businesses: z.record(z.string(), FinanceBizSchema), // bizId@city → 实业账
  loyalty: z.number().min(0).max(100).default(100), // 资金链忠诚度（连续亏损侵蚀；哗变公式接口）
})
export type Finance = z.infer<typeof FinanceSchema>

// fiscal 控城财政（E-1.4：税收 = baseTax × 六维均值%；军费→治安链②-1）
export const FiscalCitySchema = z.object({
  cityId: z.string().min(1),
  taxBase: z.number().nonnegative().default(0), // 月基准税（无控制城 = 0）
  militarySpend: z.number().nonnegative().default(0), // 军费（治安灌注，链②-1）
  adminSpend: z.number().nonnegative().default(0),
  lastRevenue: z.number().finite().default(0), // 上月净收益（+上缴/−倒贴）
})
export type FiscalCity = z.infer<typeof FiscalCitySchema>

export const FiscalSchema = z.object({
  cities: z.record(z.string(), FiscalCitySchema), // cityId → 控城账
})
export type Fiscal = z.infer<typeof FiscalSchema>

// 主角级域（E-0.2：声望 0–100 四档 / 健康 0–100；money 与 settlement.cash 分域 ——
// career.money 是「随身现银」（事件代价扣这里），settlement.cash 是经营账本结余）
export const CareerSchema = z.object({
  money: z.number().finite().default(0), // 随身现银（事件代价主流带 —— 银带 10–500）
  reputation: z.number().min(0).max(100).default(0), // 声望（无名 0–19/立身 20–49/扬名 50–79/一方之望 80–100）
  health: z.number().min(0).max(100).default(100), // 健康（60 轻伤 / 30 重伤 / ≤0 死亡线）
})
export type Career = z.infer<typeof CareerSchema>

// map 城市六维（链②：fiscal(security) → worldtick(六维)；L0-04 同口径 ∈ [0,100]）
export const CityDimsSchema = z.object({
  economy: z.number().min(0).max(100),
  security: z.number().min(0).max(100),
  culture: z.number().min(0).max(100),
  transport: z.number().min(0).max(100),
  industry: z.number().min(0).max(100),
  population: z.number().min(0).max(100),
})
export type CityDims = z.infer<typeof CityDimsSchema>

// 季节粮价因子（worldtick 写：季节进 market 一处 —— §9.2「战时系数/景气/季节粮价进 market」
// 的分工：worldtick 只产出季节参数值，改价动作仍由 market 下月消费）
export const SeasonalSchema = z.object({
  month: z.number().int().min(1).max(12),
  grainFactor: z.number().min(0.5).max(2), // 秋收 <1 / 青黄不接 >1
})
export type Seasonal = z.infer<typeof SeasonalSchema>

// ── R2 处境环域（§七记忆 / §八事件 / E-2.5 目标）─────────────────────

// 记忆条目（§7.2 形状；content append-only —— U-05#4 与链③同源约束）
export const MemoryItemTreeSchema = z.object({
  id: z.string().min(1), // m{月序}-{序}
  type: z.enum(['event', 'person', 'place', 'economy', 'life']),
  title: z.string().min(1), // 检索键（人物名/事件名/城市名）
  content: z.string().min(1), // 叙事体正文（append-only：写回 = 新 item，不改原文）
  importance: z.number().int().min(1).max(9), // ≥5 规则召回下界；≥7 引擎保底线
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
  people: z.array(z.string()).default([]), // 人物 id（RelationsPanel 反查）
  place: z.string().optional(),
  monthIndex: z.number().int().min(0), // 衰减基准
  createdAt: IsoDateSchema,
  source: z.enum(['engine', 'model']), // 保底(engine)/补写(model) 来源可观测（§7.2）
})
export type MemoryItemTree = z.infer<typeof MemoryItemTreeSchema>

export const MemoryBookTreeSchema = z.object({
  items: z.record(z.string(), MemoryItemTreeSchema), // id → item（正文本体）
  order: z.array(z.string()), // 追加序（append-only 的时序面）
})
export type MemoryBookTree = z.infer<typeof MemoryBookTreeSchema>

// 月度目标（E-2.5 九类 + 数值带；达标奖励二选一轮换制）
export const GoalSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['profit', 'reputation', 'business', 'trade', 'forces', 'city', 'savings', 'informant', 'order']),
  text: z.string().min(1),
  target: z.number(), // 达标阈值（量纲随 kind）
  done: z.boolean().default(false), // 本月达标标记
  rewardKind: z.enum(['money', 'reputation']).default('money'), // 二选一（轮换制防刷）
})
export type Goal = z.infer<typeof GoalSchema>

export const GoalsSchema = z.object({
  month: GameYearMonthSchema, // 目标所属月
  pool: z.array(GoalSchema), // 当月目标池（≤3 条；exhausted 剔除逻辑继承）
  rewardCursor: z.number().int().min(0).default(0), // 轮换制游标（money↔reputation 交替）
})
export type Goals = z.infer<typeof GoalsSchema>

// events/ 域台账（M-03：eventCD 冷却 + resolvedEvents 结算史；ISO 日期存冷却 —— §8.3）
export const EventsLedgerSchema = z.object({
  eventCD: z.record(z.string(), IsoDateSchema), // 事件 id → 上次入队 ISO 日期（真实天数差）
  resolvedEvents: z.array(z.object({
    key: z.string().min(1), // situation key
    templateId: z.string().min(1),
    optionIndex: z.number().int().min(0),
    resolvedAt: IsoDateSchema,
  })),
})
export type EventsLedger = z.infer<typeof EventsLedgerSchema>

// ── R3 政治环域（E-3 势力学 / 链① / 邻接）────────────────────────────

// 势力兵力（M-03：forces/* 与 career.forces 分域 —— 势力归 factions 模块）
export const ForcesSchema = z.object({
  // 势力 id（zhili/fengxi/zhiyuan/guomin/ri）→ 兵力（营伍单位）
  strength: z.record(z.string(), z.number().int().min(0)),
})
export type Forces = z.infer<typeof ForcesSchema>

// war/ 域台账（M-03：含 siegeWarnings 预警 —— 独立域；旧 meta 台账命名空间已废除）
export const WarSchema = z.object({
  siegeWarnings: z.record(z.string(), z.object({
    cityId: z.string().min(1),
    factionId: z.string().min(1), // 攻方
    sinceMonth: z.number().int().min(0), // 预警挂起月序（LEAD_MONTHS 计时基准）
  })),
  // contested 期台账（E-3.2：攻城判定胜 → contested → 2 月 → occupied）
  contested: z.record(z.string(), z.object({
    cityId: z.string().min(1),
    factionId: z.string().min(1),
    sinceMonth: z.number().int().min(0),
  })),
})
export type War = z.infer<typeof WarSchema>

// timeline 游标（history 域：lastCursor —— 半开区间 (lastCursor, now] 查询的左端）
export const TimelineCursorSchema = z.object({
  lastCursor: IsoDateSchema, // 已落地史实的右端（初始 = 开局日）
})
export type TimelineCursor = z.infer<typeof TimelineCursorSchema>

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
    commodities: z.record(z.string(), CommodityQuoteSchema), // market 独占
  }),
  _authority: z.object({
    territoryControl: TerritoryControlSchema,
    pendingSituations: PendingSituationsSchema,
    intelligenceObservations: IntelligenceObservationsSchema,
  }),
  // R1 经济环（2026-09-15 随环落账；缺省值兜底 = 开局无商路/无实业/无控城）
  trade: TradeSchema,
  settlement: SettlementSchema,
  finance: FinanceSchema,
  fiscal: FiscalSchema,
  map: z.record(z.string(), CityDimsSchema), // cityId → 六维（运行态；L0-04 为初值源）
  seasonal: SeasonalSchema, // worldtick 写（人口/季节粮价两条月漂移的家）
  // R2 处境环（2026-09-15 随环落账）
  memory: MemoryBookTreeSchema, // 链③：items 正文（append-only）+ order 索引（§7.1：正文是独立一等公民）
  goals: GoalsSchema, // E-2.5 九类月度目标池（月度 tick 生成/结算）
  events: EventsLedgerSchema, // events/ 域台账（eventCD 冷却 + resolvedEvents 结算史 —— M-03 行）
  career: CareerSchema, // 主角级域（M-03：命令层 + aftermath；modifyPlayer 的落点 —— E-0.2 声望/健康量纲）
  // R3 政治环（2026-09-15 随环落账）
  forces: ForcesSchema, // 势力兵力（factions 独占；与 career.forces 分域）
  war: WarSchema, // 预警/围城台账（factions 独占）
  timeline: TimelineCursorSchema, // history 游标（lastCursor —— 半开区间查询的左端）
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
      pendingSituations: { queue: {} },
      intelligenceObservations: { observations: [] },
    },
    trade: { routes: {} },
    settlement: { cash: 0, ledger: [] },
    finance: { businesses: {}, loyalty: 100 },
    fiscal: { cities: {} },
    map: {}, // 空 = worldtick 首月从 L0-04 城市表播种（初值来自数据非代码）
    seasonal: { month: Number(date.slice(5, 7)), grainFactor: 1 },
    memory: { items: {}, order: [] }, // 链③-1 管家域开局为空（保底在 resolves、补写在 TurnRunner）
    goals: { month: date, pool: [], rewardCursor: 0 },
    events: { eventCD: {}, resolvedEvents: [] },
    career: { money: 0, reputation: 0, health: 100 }, // E-0.2 初值（开局钱由身份表 startMoney 覆写 —— SK-06 命令层）
    // R3：势力兵力初值（E-2.3 台阶口径：正规营伍 100–500；势力基线 300——
    // 史实锚定校准（E-3.1 复核点）随五时代联测调）
    forces: { strength: { zhili: 300, fengxi: 300, zhiyuan: 300, guomin: 300, ri: 400 } },
    war: { siegeWarnings: {}, contested: {} },
    timeline: { lastCursor: `${date}-01` }, // 游标 = 开局日（首月查询 (开局日, 次月]）
  })
}

// 深只读视图类型（B-01 ctx.state 用；运行时由编排器 Object.freeze 递归冻结）
export type ReadonlyTree = {
  readonly world: { readonly date: GameDate }
  readonly era: { readonly eraId: string }
  readonly economy: {
    readonly currency: string
    readonly commodities: Readonly<Record<string, CommodityQuote>>
  }
  readonly _authority: {
    readonly territoryControl: Readonly<TerritoryControl>
    readonly pendingSituations: Readonly<PendingSituations>
    readonly intelligenceObservations: Readonly<z.infer<typeof IntelligenceObservationsSchema>>
  }
  readonly trade: Readonly<Trade>
  readonly settlement: Readonly<Settlement>
  readonly finance: Readonly<Finance>
  readonly fiscal: Readonly<Fiscal>
  readonly map: Readonly<Record<string, CityDims>>
  readonly seasonal: Readonly<Seasonal>
  readonly memory: Readonly<MemoryBookTree>
  readonly goals: Readonly<Goals>
  readonly events: Readonly<EventsLedger>
  readonly forces: Readonly<Forces>
  readonly war: Readonly<War>
  readonly timeline: Readonly<TimelineCursor>
}

// activeOn（claim 层按当前日期查询投影；L0-04 升格：城市控制者不设时代默认字段，
// 唯一事实源 = claim 层）。住 L1（L2 引擎模块消费的纯投影 —— L-05：被 L2 依赖的
// 纯工具住被依赖层；L3 world.ts re-export 保持既有引用面，不双份定义）。
export function activeController(
  tree: Pick<Tree, '_authority'>,
  date: string,
): string | null {
  const iso = date.length === 7 ? `${date}-01` : date
  let active: string | null = null
  for (const claim of tree._authority.territoryControl.claims) {
    if (claim.interval.from <= iso && iso < claim.interval.to) active = claim.controller
  }
  return active // 空档 → null（与「无主」不可区分 —— 由合并器四守卫防，D-08）
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
