// tests/unit/engine/temporal.spec.ts — R1-1 temporal：日期推进 + 货币锚点（复核收口）
import { describe, it, expect } from 'vitest'
import { temporal } from '../../../src/engine/temporal'
import { initialTree } from '../../../src/validation/tree'
import { tickWorld } from '../../../src/turn/monthRunner'

function ctxFor(monthIndex: number) {
  return { date: '1921-07', monthIndex, rng: () => ({ next: () => 0.5, int: () => 0, pick: <T,>(xs: readonly T[]) => xs[0] }), market: {}, diagnostics: [], state: {} }
}

describe('R1-1 temporal 货币锚点复核', () => {
  it('锚点边界：1938-12 银元 / 1939-01 法币 / 1942-01 金圆券 / 1949-12 仍金圆券', () => {
    const ym3812 = initialTree('era-warlord', '1938-12')
    const e1 = temporal.collect(ym3812 as never, ctxFor(214) as never)
    // 1938-12 → 1939-01：货币切法币
    expect(e1.some((e) => e.op === 'setCurrency' && e.args.currency === 'fabi')).toBe(true)

    const ym4112 = initialTree('era-resistance', '1941-12')
    const e2 = temporal.collect(ym4112 as never, ctxFor(250) as never)
    // 1941-12 → 1942-01：切金圆券
    expect(e2.some((e) => e.op === 'setCurrency' && e.args.currency === 'jinquanyuan')).toBe(true)

    const ym4911 = { ...initialTree('era-collapse', '1949-11'), economy: { ...initialTree('era-collapse', '1949-11').economy, currency: 'jinquanyuan' } }
    const e3 = temporal.collect(ym4911 as never, ctxFor(346) as never)
    // 1949-11 → 1949-12：仍是金圆券（锚点 347 含 1949-12，无第五种货币）
    expect(e3.some((e) => e.op === 'setCurrency')).toBe(false)
    // 对照：若树内货币是银元（异常残留），1949-12 会被拨正为金圆券
    const ymStale = { ...initialTree('era-collapse', '1949-11') } // currency = yinyuan（初始默认）
    const e4 = temporal.collect(ymStale as never, ctxFor(346) as never)
    expect(e4.some((e) => e.op === 'setCurrency' && e.args.currency === 'jinquanyuan')).toBe(true)
  })

  it('同月内 world.date 只前进一步（M-10 temporal 不变量）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const effects = temporal.collect(tree as never, ctxFor(6) as never)
    const advances = effects.filter((e) => e.op === 'advanceDate')
    expect(advances).toHaveLength(1)
    expect(advances[0].args.to).toBe('1921-08')
  })

  it('era 不在 temporal 写域（M-03：era 开局一次写入此后只读）', () => {
    expect(temporal.writes).toEqual(['world.date', 'economy.currency'])
    expect(temporal.writes).not.toContain('era')
  })

  it('tickWorld 集成：1949-11 → 1949-12 终月全管线跑满且货币稳定', () => {
    const tree = initialTree('era-collapse', '1949-11')
    const r = tickWorld(tree)
    expect(r.ok).toBe(true)
    expect(r.state.world.date).toBe('1949-12')
    expect(r.state.economy.currency).toBe('jinquanyuan')
  })
})
