// tests/unit/engine/worldtick.spec.ts — R1-7 worldtick：六维漂移 + 播种 + 季节粮价（链②-2）
import { describe, it, expect } from 'vitest'
import { worldtick } from '../../../src/engine/worldtick'
import { initialTree } from '../../../src/validation/tree'
import { cities } from '../../../src/data/cities'

function ctxFor(monthIndex: number) {
  return { date: '1921-07', monthIndex, rng: () => rngStub(), market: {}, diagnostics: [], state: {} }
}
// 稳定 rng 桩：next 恒 0.5 → 噪声项 = 0（可预测断言）；播种/回归不受噪声影响
function rngStub() {
  return { next: () => 0.5, int: () => 0, pick: <T,>(xs: readonly T[]) => xs[0] }
}

describe('R1-7 worldtick 播种', () => {
  it('map 空表首月：从 L0-04 播种全部 14 城（citySeed 携带六维全量）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const effects = worldtick.collect(tree as never, ctxFor(6) as never)
    const seeds = effects.filter((e) => e.op === 'citySeed')
    // 14 城整体播种（六维全量 —— CityDimsSchema 无中间态）
    expect(seeds).toHaveLength(14)
    const sh = seeds.find((e) => e.args.cityId === 'shanghai')
    expect((sh!.args.dims as { economy: number }).economy).toBe(95) // L0-04 上海 economy 95
    // 播种月 7 月 = 季节中性月 → 无 setSeasonal
    expect(effects.some((e) => e.op === 'setSeasonal')).toBe(false)
  })

  it('播种月非中性季节：1 月开局落 grainFactor 1.05', () => {
    const tree = initialTree('era-warlord', '1921-01')
    const effects = worldtick.collect(tree as never, ctxFor(0) as never)
    const seasonal = effects.find((e) => e.op === 'setSeasonal')
    expect(seasonal).toBeDefined()
    expect(seasonal!.args.grainFactor).toBe(1.05)
  })

  it('已播种：无月度漂移零效果？—— 否，漂移照跑（噪声 0 桩 → 回归项决定）', () => {
    const base = initialTree('era-warlord', '1921-07')
    const tree = { ...base, map: Object.fromEntries(cities.map((c) => [c.id, { ...c.dims }])) }
    const effects = worldtick.collect(tree as never, ctxFor(6) as never)
    // 六维恰在 L0 基准 → 回归项 0 + 噪声 0 → 全部不动（漂移模型的中性点）
    const dims = effects.filter((e) => e.op === 'cityEffect')
    expect(dims).toHaveLength(0)
    // 季节参数照落（7 月 factor 1.0 = 初始 → 不落；换 9 月验证）
  })

  it('季节参数：9 月落 grainFactor 0.85（秋收）；4 月 1.2（青黄不接）', () => {
    const sept = { ...initialTree('era-warlord', '1921-07'), world: { date: '1921-09' } }
    const effects = worldtick.collect(sept as never, ctxFor(8) as never)
    const seasonal = effects.find((e) => e.op === 'setSeasonal')
    expect(seasonal).toBeDefined()
    expect(seasonal!.args.grainFactor).toBe(0.85)

    const april = { ...initialTree('era-warlord', '1921-04'), world: { date: '1921-04' } }
    const effApr = worldtick.collect(april as never, ctxFor(3) as never)
    const seasonalApr = effApr.find((e) => e.op === 'setSeasonal')
    expect(seasonalApr!.args.grainFactor).toBe(1.2)
  })

  it('均值回复：高于基准的维回落、低于基准的维回升（±0.3）', () => {
    const base = initialTree('era-warlord', '1921-07')
    const map: Record<string, { economy: number; security: number; culture: number; transport: number; industry: number; population: number }> = {}
    for (const c of cities) map[c.id] = { ...c.dims }
    map['shanghai'].economy = 70 // 低于基准 95 → 回升 +0.3
    map['xian'].economy = 60 // 高于基准 45 → 回落 −0.3
    const tree = { ...base, map }
    const effects = worldtick.collect(tree as never, ctxFor(6) as never)
    const shUp = effects.find((e) => e.args.cityId === 'shanghai' && e.args.dim === 'economy')
    const xaDown = effects.find((e) => e.args.cityId === 'xian' && e.args.dim === 'economy')
    expect(shUp!.args.delta).toBe(0.3)
    expect(xaDown!.args.delta).toBe(-0.3)
  })

  it('六维钳制 [0,100]：越界值被夹回', () => {
    const base = initialTree('era-warlord', '1921-07')
    const map: Record<string, { economy: number; security: number; culture: number; transport: number; industry: number; population: number }> = {}
    for (const c of cities) map[c.id] = { ...c.dims }
    map['beijing'].security = 99 // 高于基准 50 → 回落 −0.3 → 98.7（钳制不触发，正常）
    const tree = { ...base, map }
    const effects = worldtick.collect(tree as never, ctxFor(6) as never)
    const sec = effects.find((e) => e.args.cityId === 'beijing' && e.args.dim === 'security')
    expect(sec!.args.delta).toBe(-0.3)
  })

  it('同 (state, ctx) 逐位一致（M-01 纯函数）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const a = worldtick.collect(tree as never, ctxFor(6) as never)
    const b = worldtick.collect(tree as never, ctxFor(6) as never)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('链②：worldtick 读 map/*（fiscal 前位已写 security）—— 注册序后位合法', async () => {
    const { simulationModules } = await import('../../../src/engine/registry')
    const ids = simulationModules().map((m) => m.id)
    expect(ids.indexOf('fiscal')).toBeLessThan(ids.indexOf('worldtick')) // 链②-1 → 链②-2
  })
})
