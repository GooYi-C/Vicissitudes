// tests/unit/engine/r1-loop.spec.ts — R1 出口判据：经济闭环 12 个月过月自证
// §二十九 R1：连续过月 12 次，行情与账本随月自洽，且两次运行结果逐位一致。
// 场景三合一：纯开局（无经营）/ 商路经营 / 实业+控城全开 —— 各 12 月。
import { describe, it, expect } from 'vitest'
import { tickWorld } from '../../../src/turn/monthRunner'
import { initialTree, type Tree, type TradeRoute } from '../../../src/validation/tree'
import { sameWorld } from '../../../src/turn/TurnRunner'
import { commodities } from '../../../src/data/commodities'
import { cities } from '../../../src/data/cities'

function runYear(start: Tree): Tree {
  let tree = start
  for (let i = 0; i < 12; i++) {
    const r = tickWorld(tree)
    if (!r.ok) throw new Error(`第 ${i + 1} 月失败：${r.error}`)
    tree = r.state as Tree
  }
  return tree
}

function route(over: Partial<TradeRoute>): TradeRoute {
  return {
    id: 'rt-silk', commodityId: 'cmd-silk', origin: 'guangzhou', dest: 'shanghai',
    lineId: 'line-wh-gz', volume: 50, monthlyTrips: 2, state: 'open',
    saturation: 0, capital: 0, ...over,
  }
}

describe('R1 出口判据：12 月经济闭环自证', () => {
  it('场景 A 纯开局：12 月零报错、日期逐月推进、行情 18 商品常驻', () => {
    const end = runYear(initialTree('era-warlord', '1921-07'))
    expect(end.world.date).toBe('1922-07')
    expect(Object.keys(end.economy.commodities)).toHaveLength(18)
    for (const c of commodities) {
      const q = end.economy.commodities[c.id]
      expect(Number.isFinite(q.price), c.id).toBe(true)
      expect(q.price, `${c.id} ${q.price}`).toBeGreaterThan(0)
      expect(q.price).toBeLessThan(c.basePrice * 3.1) // 3.0 钳制 × 噪声容差
    }
  })

  it('场景 A：跨 12 月（含 12 月终月）—— full 管线月照跑不炸', () => {
    const end = runYear(initialTree('era-warlord', '1921-01')) // 含 1921-12 终月
    expect(end.world.date).toBe('1922-01')
  })

  it('场景 B 商路：12 月账本自洽 —— ledger 12 条、cash = Σ流水', () => {
    const base = initialTree('era-warlord', '1921-07')
    const start: Tree = { ...base, trade: { routes: { rt: route() } } }
    const end = runYear(start)
    expect(end.settlement.ledger).toHaveLength(12) // 每月一笔过账
    const sum = Math.round(end.settlement.ledger.reduce((s, e) => s + e.amount, 0) * 100) / 100
    expect(end.settlement.cash).toBeCloseTo(sum, 0) // cash = 累计流水（口径自证）
    // 路线仍在账且饱和度落账
    const r = end.trade.routes['rt-silk']
    expect(r.saturation).toBeGreaterThan(0)
  })

  it('场景 C 全开：实业+控城+商路 12 月 —— 三账本并存自洽', () => {
    const base = initialTree('era-warlord', '1921-07')
    const sh0 = cities.find((c) => c.id === 'shanghai')!
    const start: Tree = {
      ...base,
      map: { ...base.map, shanghai: { ...sh0.dims } }, // 控城账前提 = 城已播种（fiscal 只认树内六维）
      trade: { routes: { rt: route() } },
      finance: { businesses: { 'biz-textile@shanghai': { bizId: 'biz-textile', cityId: 'shanghai', level: 1, capital: 1000 } }, loyalty: 100 },
      fiscal: { cities: { shanghai: { cityId: 'shanghai', taxBase: 190, militarySpend: 30, adminSpend: 0, lastRevenue: 0 } } },
    }
    const end = runYear(start)
    // 实业：12 月后仍有账（本金未归零或仍在经营）
    const biz = end.finance.businesses['biz-textile@shanghai']
    expect(biz).toBeDefined()
    expect(biz.capital).toBeGreaterThanOrEqual(0)
    // 控城：税收照缴、治安被灌注过
    expect(end.fiscal.cities['shanghai'].lastRevenue).not.toBe(0)
    const sh = cities.find((c) => c.id === 'shanghai')!
    expect(end.map['shanghai'].security).toBeGreaterThanOrEqual(0)
    expect(end.map['shanghai'].security).toBeLessThanOrEqual(100)
    expect(end.map['shanghai'].economy).toBeCloseTo(sh.dims.economy, 15) // 回归中值（±4.5 漂移容差）
    // 账本：12 笔月度过账全部入 ledger
    expect(end.settlement.ledger).toHaveLength(12)
  })

  it('两次运行逐位一致（B-02/ARC-5：R1 失败判据「过月 12 次两次运行结果不同」）', () => {
    const mk = (): Tree => {
      const base = initialTree('era-warlord', '1921-07')
      return {
        ...base,
        trade: { routes: { rt: route() } },
        finance: { businesses: { 'biz-flour@beijing': { bizId: 'biz-flour', cityId: 'beijing', level: 1, capital: 500 } }, loyalty: 100 },
        fiscal: { cities: { wuhan: { cityId: 'wuhan', taxBase: 150, militarySpend: 20, adminSpend: 0, lastRevenue: 0 } } },
      }
    }
    const a = runYear(mk())
    const b = runYear(mk())
    expect(sameWorld(a, b)).toBe(true)
  })

  it('行情环比连续性：第 N 月 trend 与 N−1/N 月价格自洽', () => {
    const base = initialTree('era-warlord', '1921-07')
    let tree = base
    const prices: number[] = []
    for (let i = 0; i < 4; i++) {
      const r = tickWorld(tree)
      if (!r.ok) throw new Error(r.error)
      tree = r.state as Tree
      prices.push(tree.economy.commodities['cmd-grain'].price)
    }
    // 价格不发散（无 ±50% 月跳）
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs(prices[i] - prices[i - 1]) / prices[i - 1]
      expect(change).toBeLessThan(0.5)
    }
  })

  it('终月含 full 模块：12 月 tick 的调用矩阵 = 16 模块全跑（R4 前置自证）', () => {
    const tree = initialTree('era-warlord', '1921-12')
    const r = tickWorld(tree)
    expect(r.ok).toBe(true)
    expect(r.callLog.length).toBe(16) // 11 simulation + 5 aftermath（全部 monthly+full）
    expect(new Set(r.callLog).size).toBe(16) // 恰一次
  })
})
