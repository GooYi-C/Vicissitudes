// tests/unit/engine/settlement.spec.ts — R1-4 settlement：按日折算收支（月度过账）
import { describe, it, expect } from 'vitest'
import { settlement } from '../../../src/engine/settlement'
import { initialTree, type Tree, type TradeRoute } from '../../../src/validation/tree'

function ctxFor(market: Record<string, { price: number; trend: number }> = {}) {
  return { date: '1921-07', monthIndex: 6, rng: () => ({ next: () => 0.5, int: () => 0, pick: <T,>(xs: readonly T[]) => xs[0] }), market, diagnostics: [], state: {} }
}

function route(over: Partial<TradeRoute>): TradeRoute {
  return {
    id: 'rt-1', commodityId: 'cmd-silk', origin: 'guangzhou', dest: 'shanghai',
    lineId: "line-wh-gz", volume: 50, monthlyTrips: 2, state: "open",
    saturation: 0, capital: 0, ...over,
  }
}

describe('R1-4 settlement 月度过账', () => {
  it('无经营活动 → 零产出（不落空流水）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    expect(settlement.collect(tree as never, ctxFor() as never)).toEqual([])
  })

  it('商路净利过账：cash 增、流水带月份与摘要', () => {
    const base = initialTree('era-warlord', '1921-07')
    const tree: Tree = { ...base, trade: { routes: { rt: route() } } }
    const market = { 'cmd-silk': { price: 120, trend: 0 } }
    const effects = settlement.collect(tree as never, ctxFor(market) as never)
    expect(effects).toHaveLength(1)
    expect(effects[0].op).toBe('settlementPost')
    expect(effects[0].args.month).toBe('1921-07')
    expect(effects[0].args.amount as number).toBeGreaterThan(0) // 正常路线净入
    expect(effects[0].args.cash as number).toBeCloseTo(effects[0].args.amount as number, 2) // 0 + 净入
    expect(String(effects[0].args.what)).toContain('商路')
  })

  it('停运路线不计入过账', () => {
    const base = initialTree('era-warlord', '1921-07')
    const tree: Tree = { ...base, trade: { routes: { rt: route({ state: 'suspended' }) } } }
    expect(settlement.collect(tree as never, ctxFor() as never)).toEqual([])
  })

  it('三源汇总：商路 + 实业 + 控城合成一笔过账', () => {
    const base = initialTree('era-warlord', '1921-07')
    const tree: Tree = {
      ...base,
      trade: { routes: { rt: route() } },
      finance: { businesses: { 'biz-textile@shanghai': { bizId: 'biz-textile', cityId: 'shanghai', level: 1, capital: 100, lastProfit: 4.2 } }, loyalty: 100 },
      fiscal: { cities: { wuhan: { cityId: 'wuhan', taxBase: 150, militarySpend: 20, adminSpend: 0, lastRevenue: 85.5 } } },
    }
    const market = { 'cmd-silk': { price: 120, trend: 0 } }
    const effects = settlement.collect(tree as never, ctxFor(market) as never)
    expect(effects).toHaveLength(1)
    const what = String(effects[0].args.what)
    expect(what).toContain('商路')
    expect(what).toContain('实业')
    expect(what).toContain('财政')
  })

  it('cash 口径唯一：过账后 cash = 旧 cash + amount（E-1.2 结余落点）', () => {
    const base = initialTree('era-warlord', '1921-07')
    const tree: Tree = {
      ...base,
      settlement: { cash: 100, ledger: [] },
      finance: { businesses: { b: { bizId: 'biz-flour', cityId: 'beijing', level: 1, capital: 200, lastProfit: -6 } }, loyalty: 100 },
    }
    const effects = settlement.collect(tree as never, ctxFor() as never)
    expect(effects[0].args.amount).toBe(-6)
    expect(effects[0].args.cash).toBe(94)
  })

  it('同输入逐位一致（M-01 纯函数）', () => {
    const base = initialTree('era-warlord', '1921-07')
    const tree: Tree = { ...base, trade: { routes: { rt: route() } } }
    const market = { 'cmd-silk': { price: 120, trend: 0 } }
    const a = settlement.collect(tree as never, ctxFor(market) as never)
    const b = settlement.collect(tree as never, ctxFor(market) as never)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
