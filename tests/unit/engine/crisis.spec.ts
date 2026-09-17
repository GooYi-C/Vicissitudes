// tests/unit/engine/crisis.spec.ts — R4-4 crisis：检测台账＋危机产出可入处境池
import { describe, it, expect } from 'vitest'
import { crisis, crisisToPendingSituation, SECURITY_FLOOR } from '../../../src/engine/crisis'
import { initialTree, type Tree, PendingSituationSchema, type CrisisRecord } from '../../../src/validation/tree'
import { compile } from '../../../src/turn/compiler'
import type { TickContext } from '../../../src/engine/types'

function ctx(monthIndex = 95): TickContext {
  return { date: '1928-12', monthIndex, rng: (() => { throw new Error('crisis 不用 rng') }) as never,
    market: {}, diagnostics: [], state: {} } as TickContext
}

function treeBase(over: Partial<Tree> = {}): Tree {
  return { ...initialTree('era-nanjing', '1928-12'), ...over }
}

function recordsOf(effects: ReturnType<typeof crisis.collect>): Record<string, CrisisRecord> {
  return (effects[0]?.args.records ?? {}) as Record<string, CrisisRecord>
}

describe('R4-4 crisis 检测', () => {
  it('破产：career.money < 0 → bankruptcy 入档', () => {
    const tree = treeBase({ career: { money: -50, reputation: 0, health: 100 } })
    const rec = recordsOf(crisis.collect(tree as never, ctx()))
    expect(Object.values(rec).some((r) => r.kind === 'bankruptcy')).toBe(true)
  })

  it('死亡：career.health ≤ 0 → death（severity 3）', () => {
    const tree = treeBase({ career: { money: 0, reputation: 0, health: 0 } })
    const rec = recordsOf(crisis.collect(tree as never, ctx()))
    const death = Object.values(rec).find((r) => r.kind === 'death')
    expect(death?.severity).toBe(3)
  })

  it('哗变：势力兵力 == 0 → mutiny；ri 系数 0 不误触（400 初值不归零）', () => {
    const zero = treeBase({ forces: { strength: { zhili: 0, fengxi: 300, zhiyuan: 300, guomin: 300, ri: 400 } } })
    expect(Object.values(recordsOf(crisis.collect(zero as never, ctx()))).some((r) => r.kind === 'mutiny')).toBe(true)
    const normal = treeBase()
    expect(crisis.collect(normal as never, ctx()).filter((e) => e.op === 'crisisPost')).toEqual([])
  })

  it('失城：security ≤ SECURITY_FLOOR → lost-city（带 cityId）', () => {
    const tree = treeBase({
      map: { wuhan: { economy: 50, security: SECURITY_FLOOR, culture: 50, transport: 50, industry: 50, population: 60 } } as never,
    })
    const lost = Object.values(recordsOf(crisis.collect(tree as never, ctx()))).find((r) => r.kind === 'lost-city')
    expect(lost?.cityId).toBe('wuhan')
  })

  it('幂等：同 kind 已入档 → 不重复（台账稳定）', () => {
    const existing: CrisisRecord = {
      id: 'crisis-death-90', kind: 'death', severity: 3, monthIndex: 90, month: '1928-07', detail: '健康归零（0）',
    }
    const tree = treeBase({ career: { money: 0, reputation: 0, health: 0 }, crisis: { records: { 'crisis-death-90': existing } } })
    const effects = crisis.collect(tree as never, ctx()).filter((e) => e.op === 'crisisPost')
    expect(effects).toEqual([]) // 无新增 → 零产出
  })

  it('危机产出可入处境池（R4-4 出口判据）：适配载荷过 Schema 且可走 B-07 编译通道', () => {
    const record: CrisisRecord = {
      id: 'crisis-bankruptcy-95', kind: 'bankruptcy', severity: 1, monthIndex: 95, month: '1928-12', detail: '随身现银透支（-50 银元）',
    }
    const sit = crisisToPendingSituation(record, '1928-12', 2)
    expect(() => PendingSituationSchema.parse(sit)).not.toThrow()
    expect(sit.expiresAt).toBe('1929-02-01')
    // B-07 通道：situationEnqueue 经 compile 生成落账 ops（骨架树即可编译）
    const ops = compile([{ op: 'situationEnqueue', args: { situation: sit } }], treeBase())
    expect(ops.some((o) => o.op === 'add' && typeof o.path === 'string' && o.path.includes('pendingSituations'))).toBe(true)
  })
})
