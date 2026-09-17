// tests/unit/engine/finance.spec.ts — R1-5 finance：实业经营 + 资金链忠诚度
import { describe, it, expect } from 'vitest'
import { finance } from '../../../src/engine/finance'
import { initialTree, type Tree } from '../../../src/validation/tree'

function ctxFor(monthIndex: number) {
  return { date: '1921-07', monthIndex, rng: () => deriveRngStub(), market: {}, diagnostics: [], state: {} }
}
function deriveRngStub() {
  return { next: () => 0.5, int: () => 0, pick: <T,>(xs: readonly T[]) => xs[0] }
}

function treeWithBiz(economy: number, capital = 1000): Tree {
  const base = initialTree('era-warlord', '1921-07')
  return {
    ...base,
    map: { shanghai: { economy, security: 60, culture: 90, transport: 95, industry: 85, population: 95 } },
    finance: { businesses: { 'biz-textile@shanghai': { bizId: 'biz-textile', cityId: 'shanghai', level: 1, capital } }, loyalty: 100 },
  }
}

describe('R1-5 finance 实业经营', () => {
  it('无实业 → 零产出', () => {
    const tree = initialTree('era-warlord', '1921-07')
    expect(finance.collect(tree as never, ctxFor(6) as never)).toEqual([])
  })

  it('繁荣城（economy ≥60）净利率落在 3–6% 带内（E-1.4）', () => {
    const effects = finance.collect(treeWithBiz(95) as never, ctxFor(6) as never)
    const biz = (effects[0].args.businesses as Record<string, { lastProfit: number; capital: number }>)['biz-textile@shanghai']
    expect(biz.lastProfit / 1000).toBeGreaterThanOrEqual(0.03)
    expect(biz.lastProfit / 1000).toBeLessThanOrEqual(0.06)
  })

  it('亏损侵蚀本金（厂子变小）；盈利不动本金（增资走命令层）', () => {
    const loss = finance.collect(treeWithBiz(0, 500) as never, ctxFor(6) as never) // economy 0 → 负利率
    const lossBiz = (loss[0].args.businesses as Record<string, { capital: number; lastProfit: number }>)['biz-textile@shanghai']
    expect(lossBiz.lastProfit).toBeLessThan(0)
    expect(lossBiz.capital).toBeLessThan(500)
    const gain = finance.collect(treeWithBiz(95, 500) as never, ctxFor(6) as never)
    const gainBiz = (gain[0].args.businesses as Record<string, { capital: number; lastProfit: number }>)['biz-textile@shanghai']
    expect(gainBiz.lastProfit).toBeGreaterThan(0)
    expect(gainBiz.capital).toBe(500) // 盈利不自动增资
  })

  it('忠诚度：连续亏损 −5/月；盈利 +2/月（E-2.3 哗变公式接口）', () => {
    const loss = finance.collect(treeWithBiz(0) as never, ctxFor(6) as never)
    expect(loss[0].args.loyalty).toBe(95) // 100 − 5
    const gain = finance.collect(treeWithBiz(95) as never, ctxFor(6) as never)
    expect(gain[0].args.loyalty).toBe(100) // 100 + 2 封顶
    const mid = finance.collect(treeWithBiz(10, 500) as never, ctxFor(6) as never) // economy 10 → 负利率
    expect((mid[0].args.loyalty as number)).toBeLessThan(100)
  })

  it('账本对账面：lastProfit 落账供 settlement 消费（M-10 双向可对账）', () => {
    const effects = finance.collect(treeWithBiz(95) as never, ctxFor(6) as never)
    const biz = (effects[0].args.businesses as Record<string, { lastProfit: number }>)['biz-textile@shanghai']
    expect(typeof biz.lastProfit).toBe('number')
    expect(effects[0].op).toBe('financePost')
  })

  it('同 (state, ctx) 逐位一致（M-01 纯函数；rng 噪声确定性）', () => {
    const a = finance.collect(treeWithBiz(80) as never, ctxFor(6) as never)
    const b = finance.collect(treeWithBiz(80) as never, ctxFor(6) as never)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
