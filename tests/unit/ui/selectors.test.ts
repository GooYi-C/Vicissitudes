import { describe, it, expect } from 'vitest'
import {
  PANEL_REGISTRY,
  careerSummary,
  statusSummary,
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
    expect(evaluate(statusSummary, tree, v)).toEqual({
      date: '1921-07',
      currency: 'yinyuan',
      era: 'era-warlord',
    })
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

  it('骨架零产出域 selector 返回确定空集（finance/goals/memory）', () => {
    expect(evaluate(financeSheets, tree, {}).income).toEqual([])
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
