// src/stores/selectors/index.ts — selector 注册表（§二十二 U-01）
// L7 stores 层内文件（豁免面外——与 persist 等互引会被拦，故 selector 自成一体，
// 只 import L1 类型与 L0 数据，不碰 stores 兄弟文件 —— L-02 合规）。
// U-01 契约：reads 静态字面量；compute 纯函数（禁 Date/window/IO）；memo 键 = reads 序的版本号元组。

import type { Tree } from '../../validation/tree'
import { createSelector } from './runtime'

export * from './types'
export { createSelector }

// ── 面板 selector 家族（U-05 十一面板的数据源）──────────────────────────

// CareerPanel：身份/事业/兵力/声望（career/*、world.date 声望档位随日期）
export const careerSummary = createSelector('career-summary', ['career', 'world.date', 'era'], (state: Readonly<Tree>) => {
  const career = (state as unknown as Record<string, unknown>).career as Record<string, unknown> | undefined
  return {
    money: (career?.money as number | undefined) ?? 0,
    reputation: (career?.reputation as number | undefined) ?? 0,
    health: (career?.health as number | undefined) ?? 100,
    // identityId 在 SaveRecord.meta（S-01），不在运行树 —— R2 接 meta store；骨架期投影 era
    era: state.era.eraId,
  }
})

// WorldPanel：世界态势 + 待决处境（_authority 域；queue record 键 = situation key）
export const worldSituations = createSelector(
  'world-situations',
  ['_authority.pendingSituations'],
  (state: Readonly<Tree>) => {
    const queue = state._authority.pendingSituations.queue
    return Object.values(queue).map((s) => ({ key: s.key, templateId: s.templateId, arrivesAt: s.arrivedAt }))
  },
)

// StatusPanel：日期/货币/时代/主角状态（world.date、economy.currency、career、settlement）。
// 声望档位文案按 REBUILD.md 四档口径（无名 0–19 / 立身 20–49 / 扬名 50–79 / 一方之望 80–100）——
// 蓝图明写「事件门槛数字全部挂档位，UI 显示档位名」，故档位名在 selector 层派生，视图层不拼阈值。
export function reputationTier(value: number): string {
  if (value >= 80) return '一方之望'
  if (value >= 50) return '扬名'
  if (value >= 20) return '立身'
  return '无名'
}

export const statusSummary = createSelector(
  'status-summary',
  ['world.date', 'economy.currency', 'career', 'settlement', 'era', 'identity'],
  (state: Readonly<Tree>) => ({
    date: state.world.date,
    currency: state.economy.currency,
    era: state.era.eraId,
    // 出身：null = 旧档缺域/未选身份（语义显式，不猜默认）
    identity: state.identity ? { kind: state.identity.kind, startCity: state.identity.startCity } : null,
    // 现金口径：settlement.cash 是「经营账本结余」，career.money 是「随身现银」—— 两个都显示，
    // 不合并（E-1.2 / E-0.2 分域，合并会抹掉「事件扣的是随身钱」这个区别）。
    cash: state.settlement.cash,
    personalCash: state.career.money,
    reputation: state.career.reputation,
    reputationTier: reputationTier(state.career.reputation),
    health: state.career.health,
  }),
)

// FinancePanel：账本（settlement 现金流 + finance 实业资产 + fiscal 控城税收）。
// 「现金/税收/实业」三类聚合值都是 L3 提交后的真实树状态（settlementPost/financePost/fiscalPost
// 落账），selector 只读不改算 —— 视图层不再自己求和。
export const financeSheets = createSelector(
  'finance-sheets',
  ['settlement', 'finance', 'fiscal', 'economy.currency'],
  (state: Readonly<Tree>) => {
    const ledger = state.settlement.ledger
    const businesses = Object.values(state.finance.businesses)
    const taxCities = Object.values(state.fiscal.cities)
    // 收入面：流水按月分组；本月指树内当前月（world.date 不在此 selector 的 reads 内 ——
    // 需要当前月时由视图层对照 date，故这里只给流水本身，不做「本月」切片）
    const income = ledger.map((e) => ({ month: e.month, amount: e.amount, what: e.what }))
    // 资产：现金 + 实业已投本金（lastProfit 是损益不是存量，不计入资产）
    const assets = [
      { name: `${state.economy.currency} 现金`, value: state.settlement.cash },
      ...businesses.map((b) => ({ name: `实业 ${b.bizId}@${b.cityId}`, value: b.capital })),
    ]
    return {
      income,
      assets,
      // 负债：引擎尚无借贷域（全仓无 debt/loan 域，唯一 "debt" 命中是处境模板 tmpl-old-debt）——
      // 如实返回空集并在 UI 明标「未接通」，不编造数值凑三件套。
      liabilities: [] as { name: string; amount: number }[],
      cash: state.settlement.cash,
      ledgerCount: ledger.length,
      businesses: businesses.map((b) => ({ id: `${b.bizId}@${b.cityId}`, level: b.level, capital: b.capital, lastProfit: b.lastProfit })),
      loyalty: state.finance.loyalty,
      taxCities: taxCities.map((c) => ({ cityId: c.cityId, taxBase: c.taxBase, lastRevenue: c.lastRevenue })),
      taxRevenue: taxCities.reduce((sum, c) => sum + c.lastRevenue, 0),
    }
  },
)

// IntelPanel：情报观察（_authority.intelligenceObservations）
export const intelObservations = createSelector(
  'intel-observations',
  ['_authority.intelligenceObservations'],
  (state: Readonly<Tree>) => state._authority.intelligenceObservations.observations.map((o) => ({ id: o.id, level: o.level, region: o.regionId })),
)

// 静态数据投影（L0 只读——数据本就是冻结的，selector 提供统一读通道）
import { eras, eraStartDate } from '../../data/eras'
import { identities } from '../../data/identities'
import { cities } from '../../data/cities'
import { commodities } from '../../data/commodities'
import { newspapers } from '../../data/newspapers'
import { timeline } from '../../data/timeline'
import { achievements } from '../../data/achievements'
import { worldbook } from '../../data/worldbook'
import { situationTemplates } from '../../data/situationTemplates'

// OpeningDossier：五时代开局菜单（全部可见，内容后填 —— U-06 不变量 5）
// startMonth/startDate：开局菜单需显示「从哪年哪月开始」（REBUILD.md:326）；
// startDate 由 L0 的 eraStartDate 派生，避免视图层再拼日期字面量。
export const openingEras = createSelector('opening-eras', ['era'], () =>
  eras.map((e) => ({ id: e.id, name: e.name, fromYear: e.fromYear, toYear: e.toYear, startMonth: e.startMonth, startDate: eraStartDate(e) })),
)

// OpeningDossier：所选时代的出身列表（id/kind/开局城/开局现银/是否开局控城）。
// cityName 由 L0 城市表解析 —— 视图层不得再拿 cityId 猜中文名。
export const openingIdentities = createSelector('opening-identities', ['era'], (state: Readonly<Tree>) =>
  identities.filter((i) => i.eraId === state.era.eraId).map((i) => ({
    id: i.id,
    kind: i.kind,
    startMoney: i.startMoney,
    startCity: i.startCity,
    cityName: cities.find((c) => c.id === i.startCity)?.name ?? i.startCity,
    startsWithControl: i.startsWithControl,
  })),
)

// GoalsPanel / HistoryPanel / MemoryPanel / PressPanel / MapPanel（挂起）骨架读通道

// GoalsPanel：当月目标池（E-2.5；goals 域 by goals 模块 —— TEC-07 已登记）
export const goalsList = createSelector('goals-list', ['goals'], (state: Readonly<Tree>) =>
  state.goals.pool.map((g) => ({ id: g.id, text: g.text, done: g.done })),
)

// MemoryPanel：记忆簿（append-only；order 是权威时序面，缺 order 时按 createdAt 稳定回退）
export const memoryBook = createSelector('memory-book', ['memory.items'], (state: Readonly<Tree>) => {
  const book = state.memory
  const ids = book.order.length > 0
    ? book.order
    : Object.values(book.items).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((i) => i.id)
  return {
    items: ids.flatMap((id) => {
      const it = book.items[id]
      return it ? [{ id: it.id, title: it.title, excerpt: it.content.slice(0, 60), monthIndex: it.monthIndex }] : []
    }),
    order: [...ids],
  }
})

export const pressRack = createSelector('press-rack', ['press'], () => newspapers.map((n) => ({ id: n.id, name: n.name, city: n.city })))

// RelationsPanel：人脉档（consistency 独占 relations.persons）—— 显示名回查记忆簿 people 引用，
// 查不到退回 id（人脉是引擎别名，非 L0 人名表 —— 骨架期无姓名数据源，如实退回）
export const relationsList = createSelector('relations-list', ['relations.persons', 'memory.items'], (state: Readonly<Tree>) => {
  const persons = state.relations.persons
  const titles = new Map<string, string>()
  for (const it of Object.values(state.memory.items)) {
    for (const pid of it.people) if (!titles.has(pid)) titles.set(pid, it.title)
  }
  return Object.values(persons).map((p) => ({ id: p.id, name: titles.get(p.id) ?? p.id, tier: p.tier, status: p.status }))
})

// HistoryPanel：史实时间线（L0-08 投影；视图非权威）—— 只投影到当前月为止，
// 未来节点不提前泄露（视图层选择，非权威：不改变引擎时间线）
export const timelineView = createSelector('timeline-view', ['world.date'], (state: Readonly<Tree>) => {
  const now = `${state.world.date}-99`
  return timeline
    .filter((t) => t.date <= now)
    .map((t) => ({ id: t.id, date: t.date, title: t.title }))
})
export const cityDirectory = createSelector('city-directory', ['map'], () => cities.map((c) => ({ id: c.id, name: c.name, isCore: c.isCore })))
export const commodityPrices = createSelector('commodity-prices', ['economy.commodities'], () =>
  commodities.map((c) => ({ id: c.id, name: c.name, basePrice: c.basePrice, unit: c.unit })),
)
export const codexStats = createSelector('codex-stats', ['events'], () => ({
  hardEvents: 12,
  templates: situationTemplates.length,
  achievements: achievements.length,
  worldbook: worldbook.length,
}))

// 面板注册表（UI-6：注册表与 U-05 表一致；面板数 = 11 含地图位）
export const PANEL_REGISTRY = Object.freeze([
  'CareerPanel', 'WorldPanel', 'RelationsPanel', 'MemoryPanel', 'PressPanel',
  'FinancePanel', 'StatusPanel', 'GoalsPanel', 'IntelPanel', 'HistoryPanel', 'MapPanel',
])
