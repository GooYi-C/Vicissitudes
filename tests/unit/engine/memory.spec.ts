// tests/unit/engine/memory.spec.ts — R2-3 memory：管家规范化/衰减/归档（链③-1）
import { describe, it, expect } from 'vitest'
import { memory } from '../../../src/engine/memory'
import { initialTree, type Tree, type MemoryItemTree } from '../../../src/validation/tree'
import { deriveRng } from '../../../src/engine/rng'

function ctxFor(monthIndex: number) {
  return {
    date: '1921-07', monthIndex,
    rng: (salt: string) => deriveRng('memory', monthIndex, salt),
    market: {}, diagnostics: [], state: {},
  }
}

function item(over: Partial<MemoryItemTree>): MemoryItemTree {
  return {
    id: 'm0-1', type: 'event', title: '开局', content: '你到了上海。',
    importance: 5, pinned: false, archived: false, people: [],
    monthIndex: 0, createdAt: '1921-01-01', source: 'engine', ...over,
  }
}

function treeWith(items: Record<string, MemoryItemTree>, order: string[]): Tree {
  const base = initialTree('era-warlord', '1921-07')
  return { ...base, memory: { items, order } }
}

describe('R2-3 memory 管家', () => {
  it('空记忆 → 零产出', () => {
    const tree = initialTree('era-warlord', '1921-07')
    expect(memory.collect(tree as never, ctxFor(6) as never)).toEqual([])
  })

  it('新条目（age 0）不衰减 → 幂等零产出（重复维护不产 ops）', () => {
    const tree = treeWith({ 'm6-1': item({ id: 'm6-1', monthIndex: 6 }) }, ['m6-1'])
    expect(memory.collect(tree as never, ctxFor(6) as never)).toEqual([])
  })

  it('衰减：月龄超过半衰 → importance 下降（importance 越低越快）', () => {
    // importance 2（半衰 12 月）age 24 → 降一半+；importance 8（半衰 48 月）age 24 → 降少
    const items = {
      'low': item({ id: 'low', importance: 2, monthIndex: 0 }),
      'high': item({ id: 'high', importance: 8, monthIndex: 0 }),
    }
    const tree = treeWith(items, ['low', 'high'])
    const effects = memory.collect(tree as never, ctxFor(24) as never)
    const next = effects[0].args.items as Record<string, MemoryItemTree>
    expect(next.low.importance).toBeLessThan(2) // 琐事先淡
    expect(next.high.importance).toBeLessThan(8) // 大事也淡
    expect(next.high.importance).toBeGreaterThan(next.low.importance) // 但淡得慢
  })

  it('pinned 豁免衰减；archived 不再动（全豁免月 = 幂等零产出）', () => {
    const items = {
      'pin': item({ id: 'pin', importance: 3, pinned: true, monthIndex: 0 }),
      'arch': item({ id: 'arch', importance: 3, archived: true, monthIndex: 0 }),
    }
    const tree = treeWith(items, ['pin', 'arch'])
    // 全部豁免 → 无变化 → 管家幂等零产出（不产 ops）
    const effects = memory.collect(tree as never, ctxFor(24) as never)
    expect(effects).toEqual([])
  })

  it('pinned 与可衰减混批：pinned 不动，同批普通条目照常衰减', () => {
    const items = {
      'pin': item({ id: 'pin', importance: 3, pinned: true, monthIndex: 0 }),
      'norm': item({ id: 'norm', importance: 3, monthIndex: 0 }),
    }
    const tree = treeWith(items, ['pin', 'norm'])
    const effects = memory.collect(tree as never, ctxFor(24) as never)
    expect(effects.length).toBeGreaterThan(0) // 有可衰减条目 → 产 ops
    const next = effects[0].args.items as Record<string, MemoryItemTree>
    expect(next.pin.importance).toBe(3) // 钉住豁免
    expect(next.norm.importance).toBeLessThan(3) // 普通衰减
  })

  it('归档线：importance 衰减到 0 → archived（不删除 —— 事实不灭）', () => {
    const items = { 'dying': item({ id: 'dying', importance: 1, monthIndex: 0 }) } // 半衰 6 月
    const tree = treeWith(items, ['dying'])
    const effects = memory.collect(tree as never, ctxFor(24) as never)
    const next = effects[0].args.items as Record<string, MemoryItemTree>
    expect(next.dying.archived).toBe(true)
    expect(next.dying.importance).toBe(0)
    expect(next.dying.content).toBe('你到了上海。') // content 不灭（append-only 同源）
  })

  it('孤儿清理：order 指向不存在 item → 索引剔除', () => {
    const tree = treeWith({ 'a': item({ id: 'a' }) }, ['a', 'ghost'])
    const effects = memory.collect(tree as never, ctxFor(12) as never)
    const order = effects[0].args.order as string[]
    expect(order).not.toContain('ghost')
    expect(order).toContain('a')
  })

  it('content 不可改（U-05#4/链③ append-only）：维护后 content 逐字不变', () => {
    const items = { 'x': item({ id: 'x', importance: 4, monthIndex: 0 }) }
    const tree = treeWith(items, ['x'])
    const effects = memory.collect(tree as never, ctxFor(30) as never)
    const next = effects[0].args.items as Record<string, MemoryItemTree>
    expect(next.x.content).toBe(items.x.content)
    expect(next.x.title).toBe(items.x.title)
    expect(next.x.id).toBe('x')
  })

  it('同 (state, ctx) 逐位一致（M-01 纯函数）', () => {
    const tree = treeWith({ 'x': item({ id: 'x', importance: 4, monthIndex: 0 }) }, ['x'])
    const a = memory.collect(tree as never, ctxFor(30) as never)
    const b = memory.collect(tree as never, ctxFor(30) as never)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
