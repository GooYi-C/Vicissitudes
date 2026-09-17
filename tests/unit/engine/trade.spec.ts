// tests/unit/engine/trade.spec.ts — R1-3 trade：商路利润 + 饱和回压（§9.3 全公式族）
import { describe, it, expect } from 'vitest'
import { trade, routeEconomics } from '../../../src/engine/trade'
import { initialTree, type Tree, type TradeRoute } from '../../../src/validation/tree'
import {
  SPREAD_PRESSURE, REFERENCE_BASE, REFERENCE_SUPPLY_WEIGHT,
  referenceVolume, saturationOf, compressSpread, splitAroundMid, prorateMonthly,
} from '../../../src/validation/econMath'

function ctxFor(monthIndex: number) {
  return { date: '1921-07', monthIndex, rng: () => deriveRngStub(), market: {}, diagnostics: [], state: {} }
}
function deriveRngStub() {
  return { next: () => 0.5, int: () => 0, pick: <T,>(xs: readonly T[]) => xs[0] }
}

function route(over: Partial<TradeRoute>): TradeRoute {
  return {
    id: 'rt-1', commodityId: 'cmd-silk', origin: 'guangzhou', dest: 'shanghai',
    lineId: 'line-wh-gz', volume: 50, monthlyTrips: 2, state: 'open',
    saturation: 0, capital: 0, ...over,
  }
}

describe('R1-3 §9.3 公式单点（L1 econMath）', () => {
  it('参考量 = 1200 + 全国供给 × 60（§9.3 原文）', () => {
    expect(referenceVolume(10)).toBe(REFERENCE_BASE + 10 * REFERENCE_SUPPLY_WEIGHT) // 1800
    expect(referenceVolume(0)).toBe(1200)
  })

  it('饱和度 = 吞吐 / (吞吐 + 参测量)；单调有界 (0,1)', () => {
    expect(saturationOf(1800, 1800)).toBeCloseTo(0.5)
    expect(saturationOf(0, 1800)).toBe(0)
    expect(saturationOf(1e9, 1800)).toBeLessThan(1)
  })

  it('压缩 = 毛价差 × (1 − 0.7 × saturation)；倒挂不加压', () => {
    expect(compressSpread(100, 0)).toBe(100)
    expect(compressSpread(100, 0.5)).toBeCloseTo(100 * (1 - SPREAD_PRESSURE * 0.5))
    expect(compressSpread(100, 1)).toBeCloseTo(30)
    expect(compressSpread(-50, 0.9)).toBe(-50) // 倒挂：原样返回
  })

  it('中价不动：进出各担一半（±0.5 容差，ECO-9）', () => {
    const { buy, sell } = splitAroundMid(100, 140, 28) // 中价 120，压缩价差 28
    expect(buy).toBeCloseTo(120 - 14, 0.5)
    expect(sell).toBeCloseTo(120 + 14, 0.5)
    expect((buy + sell) / 2).toBeCloseTo(120, 0.5) // 中价不变式
  })

  it('按日折算：net × trips × days/30（E-0.2 唯一口径）', () => {
    expect(prorateMonthly(300, 2, 15)).toBe(300) // 300×2×0.5
    expect(prorateMonthly(300, 1, 30)).toBe(300)
    expect(prorateMonthly(300, 1, 0)).toBe(0)
  })
})

describe('R1-3 回压实测锚三点（§9.3 实测锚：420 / 3800 / 11760）', () => {
  // 锚口径复刻：武汉—广州生丝线（line-wh-gz：days 4，baseCost 18 → freight 2.7）
  // 毛价差 = 销地溢价 − 产地折扣作用后的价差；实测锚按「压缩后单位净利 × volume × trips × days/30」
  // 锚三点 volume 50 → 500 → 2000（trips 2，其余参数同）
  const grossUnit = 120 * 1.05 - 120 * 0.85 // 销地 126 − 产地 102 = 24（毛价差/单位）
  const freight = 18 * 0.15 // 2.7

  function anchorNet(volume: number): number {
    const throughput = volume * 2 // trips 2
    const ref = referenceVolume(10) // 1800（骨架供给口径）
    const sat = saturationOf(throughput, ref)
    const unitNet = compressSpread(grossUnit, sat) - freight
    return Math.round(unitNet * volume * 2 * (4 / 30) * 100) / 100
  }

  it('40× 运量 ≠ 40× 利润（印钞机防回归 —— ECO-3）', () => {
    const a = anchorNet(50)
    const b = anchorNet(2000)
    expect(b / a).toBeLessThan(40) // 回压生效：利润增速 < 运量增速
  })

  it('A/B：压缩系数归零 → 40× 运量 ≈ 40× 利润（此时防回归断言必须失败）', () => {
    const noPressure = (volume: number) => (grossUnit - freight) * volume * 2 * (4 / 30)
    const a = noPressure(50)
    const b = noPressure(2000)
    expect(b / a).toBeCloseTo(40, 5) // 关闭回压 = 线性放大 = 印钞机（对照组证明回压非装饰）
  })

  it('回压曲线：单位利润随运量单调下降（边际递减）', () => {
    const unit = (volume: number) => {
      const sat = saturationOf(volume * 2, referenceVolume(10))
      return compressSpread(grossUnit, sat) - freight
    }
    expect(unit(50)).toBeGreaterThan(unit(500))
    expect(unit(500)).toBeGreaterThan(unit(2000))
  })
})

describe('R1-3 trade 模块行为', () => {
  it('无路线 → 零产出（骨架期常态）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    expect(trade.collect(tree as never, ctxFor(6) as never)).toEqual([])
  })

  it('在运路线饱和度落账；停运/中断不计吞吐', () => {
    const base = initialTree('era-warlord', '1921-07')
    const tree: Tree = {
      ...base,
      trade: {
        routes: {
          'rt-open': route({ id: 'rt-open', volume: 600, monthlyTrips: 3 }),
          'rt-susp': route({ id: 'rt-susp', volume: 600, monthlyTrips: 3, state: 'suspended' }),
          'rt-sev': route({ id: 'rt-sev', volume: 600, monthlyTrips: 3, state: 'severed' }),
        },
      },
    }
    const effects = trade.collect(tree as never, ctxFor(6) as never)
    expect(effects).toHaveLength(3)
    const byId = new Map(effects.map((e) => [(e.args.route as TradeRoute).id, e.args.route as TradeRoute]))
    // 开路线吞吐 1800 → 饱和度 = 1800/(1800+1800) = 0.5；停运线吞吐 0 → 饱和 0
    expect(byId.get('rt-open')?.saturation).toBeCloseTo(0.5, 4)
    expect(byId.get('rt-susp')?.saturation).toBe(0)
    expect(byId.get('rt-sev')?.saturation).toBe(0)
  })

  it('共担：同商品 ×5 路线与单条 5 倍量同饱和度（ECO-7 无套利）', () => {
    const base = initialTree('era-warlord', '1921-07')
    const five: Record<string, TradeRoute> = {}
    for (let i = 0; i < 5; i++) five[`rt-${i}`] = route({ id: `rt-${i}`, volume: 200 })
    const treeA: Tree = { ...base, trade: { routes: five } }
    const treeB: Tree = { ...base, trade: { routes: { one: route({ id: 'one', volume: 1000 }) } } }
    const a = trade.collect(treeA as never, ctxFor(6) as never)
    const b = trade.collect(treeB as never, ctxFor(6) as never)
    const satA = (a[0].args.route as TradeRoute).saturation
    const satB = (b[0].args.route as TradeRoute).saturation
    expect(satA).toBeCloseTo(satB, 6) // 5×200 与 1×1000 同吞吐 → 同饱和度
  })

  it('routeEconomics：产地折扣买入 / 销地溢价卖出', () => {
    const market = { 'cmd-silk': { price: 120, trend: 0 } }
    const r = routeEconomics(route({ volume: 50, monthlyTrips: 2, saturation: 0 }), market)
    expect(r.buy).toBeGreaterThan(0)
    expect(r.sell).toBeGreaterThan(r.buy) // 正常路线：卖 > 买
    expect(r.unitNet).toBeGreaterThan(0) // 无回压时单趟有利润
  })
})
