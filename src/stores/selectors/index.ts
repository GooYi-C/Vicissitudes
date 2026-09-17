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
import { eras } from '../../data/eras'
import { identities } from '../../data/identities'
import { cities } from '../../data/cities'
import { commodities } from '../../data/commodities'
import { newspapers } from '../../data/newspapers'
import { achievements } from '../../data/achievements'
import { worldbook } from '../../data/worldbook'
import { situationTemplates } from '../../data/situationTemplates'

// OpeningDossier：五时代开局菜单（全部可见，内容后填 —— U-06 不变量 5）
export const openingEras = createSelector('opening-eras', ['era'], () =>
  eras.map((e) => ({ id: e.id, name: e.name, fromYear: e.fromYear, toYear: e.toYear })),
)

export const openingIdentities = createSelector('opening-identities', ['era'], (state: Readonly<Tree>) =>
  identities.filter((i) => i.eraId === state.era.eraId).map((i) => ({ id: i.id, kind: i.kind, startMoney: i.startMoney })),
)

// GoalsPanel / HistoryPanel / MemoryPanel / PressPanel / MapPanel（挂起）骨架读通道
export const goalsList = createSelector('goals-list', ['goals'], () => [] as { id: string; text: string; done: boolean }[])
export const memoryBook = createSelector('memory-book', ['memory.items'], () => ({ items: [] as { id: string; title: string }[], order: [] as string[] }))
export const pressRack = createSelector('press-rack', ['press'], () => newspapers.map((n) => ({ id: n.id, name: n.name, city: n.city })))
export const relationsList = createSelector('relations-list', ['relations'], () => [] as { id: string; name: string }[])
export const timelineView = createSelector('timeline-view', ['timeline'], () =>
  // HistoryPanel 史实时间线（L0 数据投影；视图非权威）
  [] as { id: string; date: string; title: string }[],
)
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
