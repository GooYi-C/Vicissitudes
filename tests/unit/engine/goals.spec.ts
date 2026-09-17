// tests/unit/engine/goals.spec.ts — R2-2 goals：九类月度目标池（E-2.5）
import { describe, it, expect } from 'vitest'
import { goals } from '../../../src/engine/goals'
import { initialTree, type Tree } from '../../../src/validation/tree'
import { deriveRng } from '../../../src/engine/rng'

function ctxFor(monthIndex: number) {
  return {
    date: '1921-07', monthIndex,
    rng: (salt: string) => deriveRng('goals', monthIndex, salt),
    market: {}, diagnostics: [], state: {},
  }
}

describe('R2-2 goals 月度目标池', () => {
  it('首月：生成 ≤3 条目标（E-2.5 池深）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const effects = goals.collect(tree as never, ctxFor(6) as never)
    expect(effects).toHaveLength(1)
    expect(effects[0].op).toBe('goalsPost')
    const g = effects[0].args.goals as { month: string; pool: { kind: string }[] }
    expect(g.month).toBe('1921-07')
    expect(g.pool.length).toBeLessThanOrEqual(3)
    expect(g.pool.length).toBeGreaterThan(0)
  })

  it('九类封闭枚举：kind 全部落在 E-2.5 池', () => {
    const KINDS = new Set(['profit', 'reputation', 'business', 'trade', 'forces', 'city', 'savings', 'informant', 'order'])
    for (let m = 0; m < 36; m++) {
      const tree = initialTree('era-warlord', '1921-07')
      const effects = goals.collect(tree as never, ctxFor(m) as never)
      const pool = (effects[0].args.goals as { pool: { kind: string }[] }).pool
      for (const g of pool) expect(KINDS.has(g.kind), g.kind).toBe(true)
    }
  })

  it('exhausted 剔除：无实业/无商路/无控城 → 对应类不出池', () => {
    const tree = initialTree('era-warlord', '1921-07') // 开局三无
    for (let m = 0; m < 24; m++) {
      const effects = goals.collect(tree as never, ctxFor(m) as never)
      const pool = (effects[0].args.goals as { pool: { kind: string }[] }).pool
      expect(pool.some((g) => g.kind === 'business'), `m${m}`).toBe(false)
      expect(pool.some((g) => g.kind === 'trade'), `m${m}`).toBe(false)
      expect(pool.some((g) => g.kind === 'city'), `m${m}`).toBe(false)
    }
  })

  it('有实业 → business 类可入池（exhausted 解除）', () => {
    const base = initialTree('era-warlord', '1921-07')
    const tree: Tree = {
      ...base,
      finance: { businesses: { 'biz-textile@shanghai': { bizId: 'biz-textile', cityId: 'shanghai', level: 1, capital: 1000 } }, loyalty: 100 },
    }
    let seen = false
    for (let m = 0; m < 60; m++) {
      const effects = goals.collect(tree as never, ctxFor(m) as never)
      const pool = (effects[0].args.goals as { pool: { kind: string }[] }).pool
      if (pool.some((g) => g.kind === 'business')) { seen = true; break }
    }
    expect(seen).toBe(true)
  })

  it('月切换：次月池月份推进、目标 id 更新、rewardCursor 轮换', () => {
    const tree = initialTree('era-warlord', '1921-07')
    // 预置上月池（模拟已跑一月）
    const seeded: Tree = {
      ...tree,
      goals: { month: '1921-07', pool: [{ id: 'goal-profit-6', kind: 'profit', text: 'x', target: 25, done: false, rewardKind: 'money' }], rewardCursor: 0 },
    }
    const effects = goals.collect(seeded as never, ctxFor(7) as never)
    const g = effects[0].args.goals as { month: string; pool: { id: string }[]; rewardCursor: number }
    expect(g.month).toBe('1921-08') // 月切换
    expect(g.pool.some((p) => p.id === 'goal-profit-6')).toBe(false) // 旧目标不透传
    expect(g.rewardCursor).toBe(1) // 轮换
  })

  it('同 (state, ctx) 逐位一致（M-01 纯函数）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const a = goals.collect(tree as never, ctxFor(6) as never)
    const b = goals.collect(tree as never, ctxFor(6) as never)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
