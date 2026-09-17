// tests/unit/engine/market.spec.ts — R1-2 market：行情推演 + B-03 唯一发布
import { describe, it, expect } from 'vitest'
import { market } from '../../../src/engine/market'
import { initialTree } from '../../../src/validation/tree'
import { runMonth } from '../../../src/orchestration/scheduler'
import { commodities, PRICE_ANCHORS } from '../../../src/data/commodities'
import { deriveRng } from '../../../src/engine/rng'

function ctxFor(monthIndex: number, market: Record<string, { price: number; trend: number }> = {}) {
  return {
    date: '1921-07', monthIndex,
    rng: (salt: string) => deriveRng('market', monthIndex, salt),
    market, diagnostics: [], state: {},
  }
}

describe('R1-2 market 行情推演', () => {
  const tree = initialTree('era-warlord', '1921-07')

  it('产出恰一条 marketPublish 效果（B-03 唯一发布的结构面）', () => {
    const effects = market.collect(tree as never, ctxFor(6) as never)
    expect(effects).toHaveLength(1)
    expect(effects[0].op).toBe('marketPublish')
    const quotes = effects[0].args.quotes as Record<string, { price: number }>
    expect(Object.keys(quotes)).toHaveLength(18) // 全商品 18 条（L0-06）
  })

  it('首月价 = basePrice × 供需因子（锚定物价锚表 ±3.0 钳制带内）', () => {
    const effects = market.collect(tree as never, ctxFor(6) as never)
    const quotes = effects[0].args.quotes as Record<string, { price: number; trend: number }>
    for (const c of commodities) {
      const q = quotes[c.id]
      expect(q, c.id).toBeDefined()
      // 钳制带 [0.3, 3.0] × ±2% 噪声 → 首月价 ∈ basePrice × [0.294, 3.06]
      expect(q.price, `${c.id} price ${q.price}`).toBeGreaterThanOrEqual(c.basePrice * 0.294)
      expect(q.price, `${c.id} price ${q.price}`).toBeLessThanOrEqual(c.basePrice * 3.06)
      expect(q.trend).toBeGreaterThanOrEqual(-100) // 首月 prev = basePrice，trend = 噪声幅度
    }
  })

  it('同 (state, ctx) → 逐位一致（M-01 不变量 3：collect 纯函数）', () => {
    const a = market.collect(tree as never, ctxFor(6) as never)
    const b = market.collect(tree as never, ctxFor(6) as never)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('月序参与：不同 monthIndex → 不同行情序列（B-02）', () => {
    const a = market.collect(tree as never, ctxFor(6) as never)
    const b = market.collect(tree as never, ctxFor(7) as never)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('战时系数：era-resistance 行情整体上浮（×2.5 初值）', () => {
    const peace = initialTree('era-warlord', '1921-07')
    const war = initialTree('era-resistance', '1937-07')
    const qPeace = (market.collect(peace as never, ctxFor(6) as never)[0].args.quotes as Record<string, { price: number }>)['cmd-iron']
    const qWar = (market.collect(war as never, ctxFor(6) as never)[0].args.quotes as Record<string, { price: number }>)['cmd-iron']
    // 同供需因子下战时价 ≈ 和平价 × 2.5（噪声差异容忍带）
    expect(qWar.price / qPeace.price).toBeGreaterThan(2.3)
    expect(qWar.price / qPeace.price).toBeLessThan(2.7)
  })

  it('季节粮价：grainFactor 1.2（青黄不接）推高粮价', () => {
    const calm = initialTree('era-warlord', '1921-07') // grainFactor 1
    const lean = { ...calm, seasonal: { ...calm.seasonal, grainFactor: 1.2 } }
    const qCalm = (market.collect(calm as never, ctxFor(6) as never)[0].args.quotes as Record<string, { price: number }>)['cmd-grain']
    const qLean = (market.collect(lean as never, ctxFor(6) as never)[0].args.quotes as Record<string, { price: number }>)['cmd-grain']
    expect(qLean.price / qCalm.price).toBeGreaterThan(1.15)
    expect(qLean.price / qCalm.price).toBeLessThan(1.25)
    // 非粮商品不受季节因子影响（cmd-iron 对照）
    const iCalm = (market.collect(calm as never, ctxFor(6) as never)[0].args.quotes as Record<string, { price: number }>)['cmd-iron']
    const iLean = (market.collect(lean as never, ctxFor(6) as never)[0].args.quotes as Record<string, { price: number }>)['cmd-iron']
    expect(iLean.price).toBe(iCalm.price)
  })

  it('环比 trend：第二月 trend = 环比%（上扬为正）', () => {
    const t1 = initialTree('era-warlord', '1921-07')
    const first = market.collect(t1 as never, ctxFor(6) as never)[0].args.quotes as Record<string, { price: number; trend: number }>
    // 第二月：行情表已入树（模拟首月提交后的状态）
    const t2 = { ...t1, economy: { ...t1.economy, commodities: first } }
    const second = market.collect(t2 as never, ctxFor(7) as never)[0].args.quotes as Record<string, { price: number; trend: number }>
    const grain = second['cmd-grain']
    expect(grain.trend).not.toBe(0) // 有环比（噪声驱动）
    expect(Math.abs(grain.trend)).toBeLessThan(50) // 环比量级合理（无炸价）
  })

  it('物价锚同源：首月报价全部落在锚 ±3× 带内（NUM 组 E-4.1 侧）', () => {
    const effects = market.collect(tree as never, ctxFor(6) as never)
    const quotes = effects[0].args.quotes as Record<string, { price: number }>
    for (const [id, anchor] of Object.entries(PRICE_ANCHORS)) {
      expect(quotes[id].price / anchor, id).toBeLessThanOrEqual(3.2)
      expect(quotes[id].price / anchor, id).toBeGreaterThanOrEqual(0.28)
    }
  })
})

describe('R1-2 B-03 唯一发布（编排器接线）', () => {
  it('runMonth：market 产出 marketPublish 效果 = 通道有源（发布动作在 scheduler 内）', async () => {
    const { simulationModules } = await import('../../../src/engine/registry')
    const tree = initialTree('era-warlord', '1921-07')
    const run = runMonth({ state: tree as unknown as Record<string, unknown>, date: '1921-07', monthIndex: 6, isTerminalMonth: false })
    expect(run.effects.some((e) => e.op === 'marketPublish')).toBe(true)
    expect(simulationModules().map((m) => m.id)).toContain('market')
  })
})
