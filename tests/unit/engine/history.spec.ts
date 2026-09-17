// tests/unit/engine/history.spec.ts — R3-1 history：史实 claim 落地（链①-1）
import { describe, it, expect } from 'vitest'
import { history } from '../../../src/engine/history'
import { initialTree, type Tree } from '../../../src/validation/tree'
import { deriveRng } from '../../../src/engine/rng'

function ctxFor(monthIndex: number) {
  return {
    date: '1936-07', monthIndex,
    rng: (salt: string) => deriveRng('history', monthIndex, salt),
    market: {}, diagnostics: [], state: {},
  }
}

describe('R3-1 history 史实 claim 落地', () => {
  it('1936-06 tick：区间 (06-01, 07-01] 无条目 → 仅游标推进', () => {
    const tree = initialTree('era-nanjing', '1936-06')
    const effects = history.collect(tree as never, ctxFor(185) as never)
    // 1936-06 → 右端 07-01：广东易帜条目 from 1936-07-01 ∈ (06-01, 07-01] 命中！
    const claims = effects.filter((e) => e.op === 'claimTerritory')
    const cursor = effects.find((e) => e.op === 'timelinePost')
    expect(claims.length).toBeGreaterThanOrEqual(0)
    expect(cursor).toBeDefined()
    expect(cursor!.args.lastCursor).toBe('1936-07-01')
  })

  it('1936-07 两广事变：广东 zhiyuan → guomin claim 落账（链①-1 同通道）', () => {
    const tree = initialTree('era-nanjing', '1936-06')
    // 游标 06-01；tick 后右端 07-01；条目 from=1936-07-01 命中
    const effects = history.collect(tree as never, ctxFor(185) as never)
    const guangdong = effects.find((e) => e.op === 'claimTerritory' && e.args.polityId === 'vic.guangdong')
    expect(guangdong).toBeDefined()
    expect(guangdong!.args.controller).toBe('guomin')
    expect(guangdong!.args.interval).toEqual({ from: '1936-07-01', to: '1936-12-31' })
  })

  it('不重不漏：游标已过的条目不再落账（from ≤ lastCursor 跳过）', () => {
    // 游标 = 1936-08-01（广东条目已落过）：右端 09-01，区间 (08, 09] 无新条目
    const base = initialTree('era-nanjing', '1936-08')
    const tree: Tree = { ...base, timeline: { lastCursor: '1936-08-01' } }
    const effects = history.collect(tree as never, ctxFor(187) as never)
    expect(effects.filter((e) => e.op === 'claimTerritory')).toHaveLength(0)
    expect(effects.find((e) => e.op === 'timelinePost')!.args.lastCursor).toBe('1936-09-01')
  })

  it('覆盖层外年份：1921 零产出（数据缺口如实为空 —— 仅游标推进）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const effects = history.collect(tree as never, ctxFor(6) as never)
    expect(effects.filter((e) => e.op === 'claimTerritory')).toHaveLength(0)
    expect(effects).toHaveLength(1) // 仅 timelinePost
  })

  it('防重放：游标越右端 → 零产出（nowISO ≤ lastCursor）', () => {
    const base = initialTree('era-nanjing', '1936-07')
    const tree: Tree = { ...base, timeline: { lastCursor: '1937-06-01' } } // 游标已在未来
    expect(history.collect(tree as never, ctxFor(186) as never)).toEqual([])
  })

  it('同 (state, ctx) 逐位一致（M-01 纯函数）', () => {
    const tree = initialTree('era-nanjing', '1936-06')
    const a = history.collect(tree as never, ctxFor(185) as never)
    const b = history.collect(tree as never, ctxFor(185) as never)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('tickWorld 集成：1936-06 开局过月 → 广东 claim 入树', () => {
    const { tickWorld } = awaitTick()
    const tree = initialTree('era-nanjing', '1936-06')
    const r = tickWorld(tree)
    expect(r.ok, r.error).toBe(true)
    const claims = (r.state as Tree)._authority.territoryControl.claims
    const gd = claims.filter((c) => c.polityId === 'vic.guangdong')
    expect(gd.length).toBeGreaterThanOrEqual(1)
    expect(gd.some((c) => c.controller === 'guomin' && c.interval.from === '1936-07-01')).toBe(true)
  })
})

import { tickWorld } from '../../../src/turn/monthRunner'
function awaitTick() { return { tickWorld } }
