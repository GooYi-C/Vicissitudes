import { describe, it, expect } from 'vitest'
import {
  PANEL_REGISTRY,
  careerSummary,
  statusSummary,
  reputationTier,
  worldSituations,
  openingEras,
  openingIdentities,
  financeSheets,
  pressRack,
  cityDirectory,
  commodityPrices,
  codexStats,
} from '../../../src/stores/selectors'
import { evaluate, verifyReadsComplete } from '../../../src/stores/selectors/runtime'
import { bumpDomains } from '../../../src/stores/selectors/types'
import { initialTree } from '../../../src/validation/tree'

const tree = initialTree('era-warlord', '1921-07')

describe('U-05/UI-6 面板注册表', () => {
  it('面板数 = 11（含地图位）；与 U-05 表逐项一致', () => {
    expect(PANEL_REGISTRY).toHaveLength(11)
    expect([...PANEL_REGISTRY]).toEqual([
      'CareerPanel', 'WorldPanel', 'RelationsPanel', 'MemoryPanel', 'PressPanel',
      'FinancePanel', 'StatusPanel', 'GoalsPanel', 'IntelPanel', 'HistoryPanel', 'MapPanel',
    ])
  })
})

describe('U-01 selector 声明契约', () => {
  it('reads 静态字面量（构造期断言）＋ 冻结', () => {
    expect(Object.isFrozen(careerSummary.reads)).toBe(true)
    expect(careerSummary.reads).toEqual(['career', 'world.date', 'era'])
  })

  it('reads 为空 → 构造期报错', async () => {
    const { createSelector } = await import('../../../src/stores/selectors')
    expect(() => createSelector('bad', [], () => 1)).toThrow(/U-01/)
  })

  it('compute 纯：同 state 同版本号 → 逐位相同输出', () => {
    const v = { career: 1, 'world.date': 1 }
    expect(evaluate(careerSummary, tree, v)).toEqual(evaluate(careerSummary, tree, v))
    // statusSummary 已接真实树（现金/随身/声望档位/健康/出身）—— 逐项对齐，不再只断言三个陈列字段
    expect(evaluate(statusSummary, tree, v)).toEqual({
      date: '1921-07',
      currency: 'yinyuan',
      era: 'era-warlord',
      identity: null,
      cash: 0,
      personalCash: 0,
      reputation: 0,
      reputationTier: '无名',
      health: 100,
    })
  })

  it('声望档位按 REBUILD.md 四档口径切（UI 显示档位名，不显示阈值）', () => {
    expect(reputationTier(0)).toBe('无名')
    expect(reputationTier(19)).toBe('无名')
    expect(reputationTier(20)).toBe('立身')
    expect(reputationTier(49)).toBe('立身')
    expect(reputationTier(50)).toBe('扬名')
    expect(reputationTier(79)).toBe('扬名')
    expect(reputationTier(80)).toBe('一方之望')
    expect(reputationTier(100)).toBe('一方之望')
  })

  it('完备性检测（开发期 Proxy）：声明域覆盖实际访问根', () => {
    const r = verifyReadsComplete(careerSummary as unknown as { compute: (s: Readonly<unknown>) => unknown } & object, tree)
    expect(r.ok, `missing: ${r.missing}`).toBe(true)
  })

  it('L0 数据投影：五时代全部可见（内容后填 —— U-06 不变量 5）', () => {
    const eras = evaluate(openingEras, tree, {})
    expect(eras).toHaveLength(5)
    expect(eras.map((e) => e.id)).toContain('era-resistance')
  })

  it('开局身份投影：8 身份 × 当前时代', () => {
    const ids = evaluate(openingIdentities, tree, {})
    expect(ids).toHaveLength(8)
  })

  it('报夹面板数据源：报纸来自 L0 史实报名（S-16）', () => {
    const papers = evaluate(pressRack, tree, {})
    expect(papers.length).toBeGreaterThanOrEqual(5)
    expect(papers.map((p) => p.name)).toContain('申报')
  })

  it('城市/商品/图鉴投影可用（真实数据非占位文本 —— 骨架门口径）', () => {
    expect(evaluate(cityDirectory, tree, {})).toHaveLength(14)
    expect(evaluate(commodityPrices, tree, {})).toHaveLength(18)
    const codex = evaluate(codexStats, tree, {})
    expect(codex.templates).toBe(8)
    expect(codex.achievements).toBe(17)
  })

  it('账本 selector 读真实树域：空树 → 空账本（现金 0、无实业、无控城）', () => {
    const sheets = evaluate(financeSheets, tree, {})
    expect(sheets.income).toEqual([])
    expect(sheets.assets).toEqual([{ name: 'yinyuan 现金', value: 0 }])
    expect(sheets.cash).toBe(0)
    expect(sheets.taxRevenue).toBe(0)
    expect(sheets.businesses).toEqual([])
    expect(sheets.liabilities).toEqual([])
  })

  it('账本 selector 反映已提交的域状态（现金流/实业资产/控城税收三类聚合）', () => {
    const seeded = initialTree('era-warlord', '1921-07')
    seeded.settlement.cash = 845.96
    seeded.settlement.ledger = [
      { month: '1921-08', amount: -12.4, what: '佣工月钱' },
      { month: '1921-09', amount: 84.6, what: '财政净入' },
    ]
    seeded.finance.businesses = {
      'biz-teahouse@wuhan': { bizId: 'biz-teahouse', cityId: 'wuhan', level: 1, capital: 200, lastProfit: 9.5 },
    }
    seeded.fiscal.cities = {
      wuhan: { cityId: 'wuhan', taxBase: 150, militarySpend: 10, adminSpend: 5, lastRevenue: 84.58 },
    }
    const sheets = evaluate(financeSheets, seeded, {})
    expect(sheets.income).toHaveLength(2)
    expect(sheets.income[0]).toEqual({ month: '1921-08', amount: -12.4, what: '佣工月钱' })
    expect(sheets.cash).toBe(845.96)
    expect(sheets.assets).toEqual([
      { name: 'yinyuan 现金', value: 845.96 },
      { name: '实业 biz-teahouse@wuhan', value: 200 },
    ])
    expect(sheets.businesses).toEqual([{ id: 'biz-teahouse@wuhan', level: 1, capital: 200, lastProfit: 9.5 }])
    expect(sheets.taxCities).toEqual([{ cityId: 'wuhan', taxBase: 150, lastRevenue: 84.58 }])
    expect(sheets.taxRevenue).toBe(84.58)
  })

  it('reads 完备：账本 selector 声明域覆盖实际访问（含 economy.currency）', () => {
    const r = verifyReadsComplete(financeSheets as unknown as { compute: (s: Readonly<unknown>) => unknown } & object, tree)
    expect(r.ok, `missing: ${r.missing}`).toBe(true)
    expect(financeSheets.reads).toEqual(['settlement', 'finance', 'fiscal', 'economy.currency'])
  })

  it('U-02 域版本号：bump 只动命中域；会话级从零起算', () => {
    const v0: Record<string, number> = {}
    const v1 = bumpDomains(v0, ['world.date'])
    expect(v1['world.date']).toBe(1)
    expect(v1['economy.currency']).toBeUndefined()
    const v2 = bumpDomains(v1, ['world.date', 'economy.currency'])
    expect(v2['world.date']).toBe(2)
    expect(v2['economy.currency']).toBe(1)
  })

  it('U-07 断点不进 memo 键：同 state 同版本 → 同输出（跨断点一致性的数据面）', () => {
    // memo 键只由 reads 序的版本号构成 —— 不含窗口宽度/设备形态
    const a = evaluate(worldSituations, tree, { '_authority.pendingSituations': 0 })
    const b = evaluate(worldSituations, tree, { '_authority.pendingSituations': 0 })
    expect(a).toEqual(b)
  })
})
