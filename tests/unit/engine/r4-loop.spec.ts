// tests/unit/engine/r4-loop.spec.ts — R4 环出口：full cadence 就位（monthly/full 都跑满，full 只在终月）
import { describe, it, expect } from 'vitest'
import { initialTree, type Tree, TreeSchema } from '../../../src/validation/tree'
import { tickWorld } from '../../../src/turn/monthRunner'
import { sameWorld } from '../../../src/turn/TurnRunner'

// 种子：情报观察过期/未过期各一＋记忆引用两人格＋一座 security 压线城
function seeded(date: string): Tree {
  const base = initialTree('era-nanjing', date)
  return {
    ...base,
    _authority: {
      ...base._authority,
      intelligenceObservations: {
        observations: [
          { id: 'old', regionId: 'wuhan', level: 2, observedAt: '1928-03-01', expiresAt: '1928-06-01' }, // 1928 年内早过期
          { id: 'live', regionId: 'chengdu', level: 1, observedAt: '1928-10-01', expiresAt: '1929-01-01' },
        ],
      },
    },
    memory: {
      items: {
        m1: {
          id: 'm1', type: 'person', title: '护国旧识', content: '……', importance: 6,
          pinned: false, archived: false, people: ['cai-pei', 'tang-jiyao'], monthIndex: 88, createdAt: '1928-05-01', source: 'engine',
        },
      },
      order: ['m1'],
    },
  }
}

function loop(months: number, start: Tree): { tree: Tree; traces: string[] } {
  let tree = start
  const traces: string[] = []
  for (let i = 0; i < months; i++) {
    const r = tickWorld(tree)
    expect(r.ok, `月${i + 1}: ${r.error}`).toBe(true)
    tree = r.state as Tree
    traces.push(`${tree.world.date} labor非空=${Object.keys(tree._computed.labor).length > 0} intel=${tree._authority.intelligenceObservations.observations.length} relations=${Object.keys(tree.relations.persons).length} crisis=${Object.keys(tree.crisis.records).length}`)
  }
  return { tree, traces }
}

describe('R4 环出口：全 cadence 就位', () => {
  it('非终月（1928-06）tick：full 模块不跑——labor 域无任何写入', () => {
    const r = tickWorld(seeded('1928-06'))
    expect(r.ok).toBe(true)
    expect(Object.keys((r.state as Tree)._computed.labor)).toHaveLength(0) // R4-1：非终月零写入
    expect((r.state as Tree).world.date).toBe('1928-07')
  })

  it('12 月 loop 到终月：labor 投影非空 / intel 过期剔除 / relations 注册兜底 / crisis 按需入档', () => {
    const { tree } = loop(12, seeded('1928-01'))
    expect(tree.world.date).toBe('1929-01')
    // labor：终月关账投影（14 城上下，全部 manpower ≥ 0 且带 asOfMonth 终月）
    const lab = tree._computed.labor
    expect(Object.keys(lab).length).toBeGreaterThan(0)
    for (const v of Object.values(lab)) {
      expect(v.asOfMonth).toBe('1928-12')
      expect(v.manpower).toBeGreaterThanOrEqual(0)
    }
    // intelligence：'old'（1928-06 过期）被剔除；'live' 存活
    const ids = tree._authority.intelligenceObservations.observations.map((o) => o.id)
    expect(ids).not.toContain('old')
    expect(ids).toContain('live')
    // consistency：两个引用人格已注册（无悬空引用）
    expect(Object.keys(tree.relations.persons).sort()).toEqual(['cai-pei', 'tang-jiyao'])
  })

  it('危机链路闭环（终月触发）：health=0 时 death 入档＋可适配入处境池', async () => {
    const start = seeded('1928-12')
    const dying: Tree = { ...start, career: { money: 10, reputation: 0, health: 0 } }
    const r = tickWorld(dying)
    expect(r.ok).toBe(true)
    const after = r.state as Tree
    const death = Object.values(after.crisis.records).find((c) => c.kind === 'death')
    expect(death, JSON.stringify(after.crisis.records)).toBeDefined()
    const { crisisToPendingSituation } = await import('../../../src/engine/crisis')
    const sit = crisisToPendingSituation(death!, '1928-12')
    expect(sit.key).toContain('crisis-death')
  })

  it('两次 12 月 loop 逐位一致（ARC-5 月级——full 管线确定性）', () => {
    const a = loop(12, seeded('1928-01')).tree
    const b = loop(12, seeded('1928-01')).tree
    expect(sameWorld(a, b)).toBe(true)
  })

  it('旧档兼容：缺 R4 三域的树 → TreeSchema 补默认可载（域级 .default 兜底）', () => {
    const full = initialTree('era-nanjing', '1928-12') as unknown as Record<string, unknown>
    const { crisis, relations, _computed, ...rest } = full
    void crisis; void relations; void _computed
    const reparsed = TreeSchema.parse(rest)
    expect(reparsed.crisis).toEqual({ records: {} })
    expect(reparsed.relations).toEqual({ persons: {} })
    expect(reparsed._computed).toEqual({ labor: {} })
  })
})
