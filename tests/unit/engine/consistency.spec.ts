// tests/unit/engine/consistency.spec.ts — R4-3 consistency：人脉与记忆交叉一致（无悬空引用）
import { describe, it, expect } from 'vitest'
import { consistency } from '../../../src/engine/consistency'
import { initialTree, type Tree, type MemoryItemTree, type RelationPerson } from '../../../src/validation/tree'
import type { TickContext } from '../../../src/engine/types'

function ctx(): TickContext {
  return { date: '1928-12', monthIndex: 95, rng: (() => { throw new Error('consistency 不用 rng') }) as never,
    market: {}, diagnostics: [], state: {} } as TickContext
}

function item(id: string, people: string[]): MemoryItemTree {
  return {
    id, type: 'person', title: id, content: '……', importance: 5,
    pinned: false, archived: false, people, monthIndex: 90, createdAt: '1928-07-01', source: 'engine',
  }
}

function treeWith(memoryPeople: string[][], persons: Record<string, RelationPerson> = {}): Tree {
  const base = initialTree('era-nanjing', '1928-12')
  const items: Record<string, MemoryItemTree> = {}
  memoryPeople.forEach((people, i) => { items[`m${i}`] = item(`m${i}`, people) })
  return {
    ...base,
    memory: { items, order: Object.keys(items) },
    relations: { persons },
  }
}

describe('R4-3 consistency 交叉一致', () => {
  it('记忆引用的每个 id 自动注册 stub（alive/tier 0）——无悬空引用', () => {
    const tree = treeWith([['cai-pei', 'liang-qichao'], ['cai-pei']])
    const effects = consistency.collect(tree as never, ctx())
    expect(effects).toHaveLength(1)
    const persons = effects[0].args.persons as Record<string, RelationPerson>
    expect(Object.keys(persons).sort()).toEqual(['cai-pei', 'liang-qichao'])
    expect(persons['cai-pei']).toEqual({ id: 'cai-pei', status: 'alive', tier: 0, propagated: false })
  })

  it('死亡/被捕传播：status≠alive → tier 落 0 且 propagated（一次到位收敛）', () => {
    const persons: Record<string, RelationPerson> = {
      'cai-pei': { id: 'cai-pei', status: 'dead', tier: 3, propagated: false },
    }
    const tree = treeWith([['cai-pei']], persons)
    const effects = consistency.collect(tree as never, ctx())
    const next = effects[0].args.persons as Record<string, RelationPerson>
    expect(next['cai-pei']).toEqual({ id: 'cai-pei', status: 'dead', tier: 0, propagated: true })
  })

  it('传播收敛：二次运行零产出（不死循环）', () => {
    const persons: Record<string, RelationPerson> = {
      'cai-pei': { id: 'cai-pei', status: 'arrested', tier: 2, propagated: false },
    }
    const tree = treeWith([['cai-pei']], persons)
    const first = consistency.collect(tree as never, ctx())
    const afterFirst: Tree = { ...tree, relations: { persons: first[0].args.persons as never } }
    expect(consistency.collect(afterFirst as never, ctx())).toEqual([])
  })

  it('无新引用且无待传播 → 零产出（幂等）', () => {
    const persons: Record<string, RelationPerson> = {
      'cai-pei': { id: 'cai-pei', status: 'alive', tier: 0, propagated: false },
    }
    const tree = treeWith([['cai-pei']], persons)
    expect(consistency.collect(tree as never, ctx())).toEqual([])
  })
})
