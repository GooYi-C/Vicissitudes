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

// StatusPanel：日期/货币/健康（world.date、economy.currency、career/*）
export const statusSummary = createSelector(
  'status-summary',
  ['world.date', 'economy.currency', 'career'],
  (state: Readonly<Tree>) => ({
    date: state.world.date,
    currency: state.economy.currency,
    era: state.era.eraId,
  }),
)

// FinancePanel：账本三件套骨架（settlement/finance/fiscal 域——SK-06 零产出期返回空账本）
export const financeSheets = createSelector('finance-sheets', ['settlement', 'finance', 'fiscal'], () => ({
  income: [] as { date: string; amount: number; what: string }[],
  assets: [] as { name: string; value: number }[],
  liabilities: [] as { name: string; amount: number }[],
}))

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

export const openingIdentities = createSelector('opening-identities', ['era'], (state: Readonly<Tree>) =>
  identities.filter((i) => i.eraId === state.era.eraId).map((i) => ({ id: i.id, kind: i.kind, startMoney: i.startMoney })),
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
