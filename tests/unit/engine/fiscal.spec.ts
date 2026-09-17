// tests/unit/engine/fiscal.spec.ts — R1-6 fiscal：控城税收 + 军费→治安（链②-1）
import { describe, it, expect } from 'vitest'
import { fiscal } from '../../../src/engine/fiscal'
import { initialTree, type Tree } from '../../../src/validation/tree'
import { cities } from '../../../src/data/cities'

function ctxFor() {
  return { date: '1921-07', monthIndex: 6, rng: () => ({ next: () => 0.5, int: () => 0, pick: <T,>(xs: readonly T[]) => xs[0] }), market: {}, diagnostics: [], state: {} }
}

function treeWithCity(cityId: string, over: Partial<{ taxBase: number; militarySpend: number }> = {}): Tree {
  const base = initialTree('era-warlord', '1921-07')
  // 控城账的前提 = 该城已在 map 播种（fiscal 只认树内六维 —— 未播种不入账）
  const city = cities.find((c) => c.id === cityId)!
  return {
    ...base,
    map: { ...base.map, [cityId]: { ...city.dims } },
    fiscal: { cities: { [cityId]: { cityId, taxBase: over.taxBase ?? 0, militarySpend: over.militarySpend ?? 0, adminSpend: 0, lastRevenue: 0 } } },
  }
}

describe('R1-6 fiscal 控城财政', () => {
  it('无控城 → fiscalPost 空账（骨架期常态）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const effects = fiscal.collect(tree as never, ctxFor() as never)
    expect(effects).toHaveLength(1)
    expect(effects[0].op).toBe('fiscalPost')
    expect(Object.keys(effects[0].args.cities as object)).toHaveLength(0)
  })

  it('税收 = taxBase × 六维均值%（E-1.4）；行政费 20%；净收益 = 税 − 行政 − 军费', () => {
    const tree = treeWithCity('shanghai', { taxBase: 190 })
    const effects = fiscal.collect(tree as never, ctxFor() as never)
    const f = (effects[0].args.cities as Record<string, { lastRevenue: number; taxBase: number }>)['shanghai']
    const sh = cities.find((c) => c.id === 'shanghai')!
    const avg = (sh.dims.economy + sh.dims.security + sh.dims.culture + sh.dims.transport + sh.dims.industry + sh.dims.population) / 6
    const tax = 190 * (avg / 100)
    expect(f.lastRevenue).toBeCloseTo(tax - tax * 0.2, 1) // 无军费：税 − 行政
    expect(f.taxBase).toBe(190)
  })

  it('军费→治安灌注（链②-1）：cityEffect 写 map/*/security', () => {
    const tree = treeWithCity('shanghai', { taxBase: 190, militarySpend: 100 })
    const effects = fiscal.collect(tree as never, ctxFor() as never)
    const sec = effects.find((e) => e.op === 'cityEffect')
    expect(sec).toBeDefined()
    expect(sec!.args.dim).toBe('security')
    expect(sec!.args.cityId).toBe('shanghai')
    // 灌注公式：(100 / (100 + 95)) × 15 − 5 ≈ +2.68（正灌注：军费高于基准线）
    expect(sec!.args.delta as number).toBeGreaterThan(0)
  })

  it('军费不足 → 治安负灌注（残城军费倒贴的机制面）', () => {
    const tree = treeWithCity('wuhan', { taxBase: 150, militarySpend: 10 })
    const effects = fiscal.collect(tree as never, ctxFor() as never)
    const sec = effects.find((e) => e.op === 'cityEffect')
    // (10 / (10 + 75)) × 15 − 5 ≈ −3.2（负灌注）
    expect(sec!.args.delta as number).toBeLessThan(0)
  })

  it('军费倒贴：净收益可负（E-1.4 残城口径）', () => {
    const tree = treeWithCity('wuhan', { taxBase: 100, militarySpend: 90 })
    const effects = fiscal.collect(tree as never, ctxFor() as never)
    const post = effects.find((e) => e.op === 'fiscalPost')!
    const f = (post.args.cities as Record<string, { lastRevenue: number }>)['wuhan']
    expect(f.lastRevenue).toBeLessThan(0)
  })

  it('链②顺序：fiscal 的 cityEffect(security) 在效果流中先于 worldtick 六维（注册序保证）', async () => {
    const { tickWorld } = await import('../../../src/turn/monthRunner')
    const tree = treeWithCity('shanghai', { taxBase: 190, militarySpend: 100 })
    const r = tickWorld(tree)
    expect(r.ok, r.error).toBe(true)
    // 提交成功 = fiscal 与 worldtick 同批原子落账（顺序由 registry 注册序锁死）
    expect(r.writtenDomains).toContain('fiscal.cities')
    expect(r.writtenDomains).toContain('map.shanghai')
  })

  it('未知城市不入账（拒载不猜测）', () => {
    const base = initialTree('era-warlord', '1921-07')
    const tree: Tree = { ...base, fiscal: { cities: { nowhere: { cityId: 'nowhere', taxBase: 100, militarySpend: 0, adminSpend: 0, lastRevenue: 0 } } } }
    const effects = fiscal.collect(tree as never, ctxFor() as never)
    expect(Object.keys(effects[0].args.cities as object)).toHaveLength(0)
  })
})
