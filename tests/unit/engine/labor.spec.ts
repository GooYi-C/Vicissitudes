// tests/unit/engine/labor.spec.ts — R4-1 labor：劳动力投影（full；幂等纯投影）
import { describe, it, expect } from 'vitest'
import { labor, MANPOWER_FACTOR } from '../../../src/engine/labor'
import { initialTree, type Tree } from '../../../src/validation/tree'
import type { TickContext } from '../../../src/engine/types'

function ctx(): TickContext {
  return { date: '1928-12', monthIndex: 95, rng: (() => { throw new Error('labor 不用 rng') }) as never,
    market: {}, diagnostics: [], state: {} } as TickContext
}

function treeWithMap(pops: Record<string, number>, prevLabor: Record<string, unknown> = {}): Tree {
  const base = initialTree('era-nanjing', '1928-12')
  const map: Record<string, never> = {}
  for (const [id, p] of Object.entries(pops)) {
    map[id] = { economy: 50, security: 50, culture: 50, transport: 50, industry: 50, population: p } as never
  }
  return { ...base, map, _computed: { labor: prevLabor as never } }
}

describe('R4-1 labor 劳动力投影', () => {
  it('map 未播种（空）→ 零产出（数据缺口如实留空，不造假数）', () => {
    const tree = initialTree('era-nanjing', '1928-12')
    expect(labor.collect(tree as never, ctx())).toEqual([])
  })

  it('投影：manpower = floor(人口维 × MANPOWER_FACTOR)，asOfMonth = 当月', () => {
    const tree = treeWithMap({ wuhan: 66, xian: 33 })
    const effects = labor.collect(tree as never, ctx())
    expect(effects).toHaveLength(1)
    const arg = effects[0].args.labor as Record<string, { manpower: number; asOfMonth: string }>
    expect(effects[0].op).toBe('laborPost')
    expect(arg.wuhan).toEqual({ manpower: Math.floor(66 * MANPOWER_FACTOR), asOfMonth: '1928-12' })
    expect(arg.xian.manpower).toBe(Math.floor(33 * MANPOWER_FACTOR))
  })

  it('幂等：投影与现状全等 → 零写入（终月重复跑不产 ops）', () => {
    const seeded = { wuhan: { manpower: Math.floor(66 * MANPOWER_FACTOR), asOfMonth: '1928-12' } }
    const tree = treeWithMap({ wuhan: 66 }, seeded)
    expect(labor.collect(tree as never, ctx())).toEqual([])
  })

  it('同 (state, ctx) 纯函数：两次调用逐位一致（M-01）', () => {
    const tree = treeWithMap({ wuhan: 66, beijing: 88 })
    const a = labor.collect(tree as never, ctx())
    const b = labor.collect(tree as never, ctx())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
