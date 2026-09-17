// tests/unit/engine/intelligence.spec.ts — R4-2 intelligence：过期衰减（full；台账面无残留）
import { describe, it, expect } from 'vitest'
import { intelligence } from '../../../src/engine/intelligence'
import { initialTree, type Tree } from '../../../src/validation/tree'
import type { TickContext } from '../../../src/engine/types'

function ctx(): TickContext {
  return { date: '1928-12', monthIndex: 95, rng: (() => { throw new Error('intelligence 不用 rng') }) as never,
    market: {}, diagnostics: [], state: {} } as TickContext
}

function treeWithObs(obs: { id: string; expiresAt: string; level?: number }[]): Tree {
  const base = initialTree('era-nanjing', '1928-12')
  return {
    ...base,
    _authority: {
      ...base._authority,
      intelligenceObservations: {
        observations: obs.map((o) => ({
          id: o.id, regionId: 'wuhan', level: o.level ?? 2, observedAt: '1928-10-01', expiresAt: o.expiresAt,
        })),
      },
    },
  }
}

describe('R4-2 intelligence 过期衰减', () => {
  it('过期项（expiresAt ≤ 当月首日）被剔除；未过期全保', () => {
    const tree = treeWithObs([
      { id: 'dead-1', expiresAt: '1928-11-01' }, // 已过期
      { id: 'dead-2', expiresAt: '1928-12-01' }, // 恰当月首日 → 过期
      { id: 'live-1', expiresAt: '1929-01-01' }, // 未过期
    ])
    const effects = intelligence.collect(tree as never, ctx())
    expect(effects).toHaveLength(1)
    const obs = effects[0].args.observations as { id: string; expiresAt: string }[]
    expect(obs.map((o) => o.id)).toEqual(['live-1'])
    expect(obs.every((o) => o.expiresAt > '1928-12-01')).toBe(true) // 台账面无过期残留（失败判据矛点）
  })

  it('无过期项 → 零产出（幂等）', () => {
    const tree = treeWithObs([{ id: 'live-1', expiresAt: '1929-01-01' }])
    expect(intelligence.collect(tree as never, ctx())).toEqual([])
  })

  it('空观察表 → 零产出（骨架常态不打扰）', () => {
    const tree = initialTree('era-nanjing', '1928-12')
    expect(intelligence.collect(tree as never, ctx())).toEqual([])
  })

  it('衰减二次运行：第一次剔除后再跑 → 零产出（收敛）', () => {
    const tree = treeWithObs([{ id: 'dead-1', expiresAt: '1928-06-01' }])
    const first = intelligence.collect(tree as never, ctx())
    const afterFirst: Tree = {
      ...tree,
      _authority: { ...tree._authority, intelligenceObservations: { observations: first[0].args.observations as never } },
    }
    expect(intelligence.collect(afterFirst as never, ctx())).toEqual([])
  })
})
