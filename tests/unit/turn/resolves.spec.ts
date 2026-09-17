// tests/unit/turn/resolves.spec.ts — R2-4 resolves：结算管道 + 双重门槛 + 保底记忆（§8.4 / B-09）
import { describe, it, expect } from 'vitest'
import { resolveSituation, resolveGate } from '../../../src/turn/resolves'
import { initialTree, type Tree, type PendingSituation } from '../../../src/validation/tree'
import { TurnRunner, sameWorld } from '../../../src/turn/TurnRunner'

function sit(over: Partial<PendingSituation> = {}): PendingSituation {
  return {
    key: 'evt-street-gambling#6',
    templateId: 'evt-street-gambling',
    payload: {
      version: 1,
      title: '街头牌局',
      desc: '巷口有人摆开了牌九，庄家皮笑肉不笑地招呼围观的人。',
      options: [
        { text: '坐下摸两把', effects: [{ op: 'modifyPlayer', args: { field: 'money', value: -5 } }] },
        { text: '摇头走开', effects: [] },
      ],
      tags: ['society'],
    },
    arrivedAt: '1921-07-01',
    expiresAt: '1921-08-01',
    ...over,
  }
}

function treeWithQueue(s: PendingSituation): Tree {
  const base = initialTree('era-warlord', '1921-07')
  return { ...base, _authority: { ...base._authority, pendingSituations: { queue: { [s.key]: s } } } }
}

describe('R2-4 结算双重门槛（B-09）', () => {
  it('命中本轮批次 + 选项合法 → 放行（结算层第二道门）', () => {
    const tree = treeWithQueue(sit())
    const gate = resolveGate({ key: 'evt-street-gambling#6', optionIndex: 0 }, tree)
    expect(gate.ok).toBe(true)
  })

  it('陈旧引用（key 不在队列）→ 拒绝（B-09-2 防重复结算）', () => {
    const tree = treeWithQueue(sit())
    const r = resolveSituation({ key: 'gone#0', optionIndex: 0 }, tree)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('不在本轮批次')
  })

  it('过期处境 → 拒绝（EVT-9：不投影替代）', () => {
    // 过期语义月粒度：expiresAt 早于当月起始（iso = 当月-01）即过期
    const tree = treeWithQueue(sit({ expiresAt: '1921-06-15' }))
    const r = resolveSituation({ key: 'evt-street-gambling#6', optionIndex: 0 }, tree)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('过期')
  })

  it('选项越界 → 拒绝', () => {
    const tree = treeWithQueue(sit())
    const r = resolveSituation({ key: 'evt-street-gambling#6', optionIndex: 5 }, tree)
    expect(r.ok).toBe(false)
  })

  it('门槛不足 + 直接结算请求 → 拒绝（BUS-5 非空：防静默降级回归）', () => {
    const empty = initialTree('era-warlord', '1921-07') // 队列空
    const r = resolveSituation({ key: 'anything#1', optionIndex: 0 }, empty)
    expect(r.ok).toBe(false)
  })
})

describe('R2-4 结算管道（§8.4）', () => {
  it('效果透传 + 出队 + 台账追加（三件随行效果）', () => {
    const tree = treeWithQueue(sit())
    const r = resolveSituation({ key: 'evt-street-gambling#6', optionIndex: 0 }, tree)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const ops = r.effects.map((e) => e.op)
    expect(ops).toContain('modifyPlayer') // 选项效果透传
    expect(ops).toContain('situationDequeue') // 出队
    expect(ops).toContain('eventsPost') // 台账
    const post = r.effects.find((e) => e.op === 'eventsPost')!
    const resolved = post.args.resolvedEvents as { key: string; optionIndex: number }[]
    expect(resolved).toHaveLength(1)
    expect(resolved[0].key).toBe('evt-street-gambling#6')
    expect(resolved[0].optionIndex).toBe(0)
  })

  it('整批可提交：compiler → TurnRunner 原子落账，queue 清空、台账入档', () => {
    const tree = treeWithQueue(sit())
    const r = resolveSituation({ key: 'evt-street-gambling#6', optionIndex: 1 }, tree)
    if (!r.ok) throw new Error(r.message)
    const runner = new TurnRunner()
    const commit = runner.commit(r.effects, tree)
    expect(commit.ok, commit.error).toBe(true)
    const next = commit.state as Tree
    expect(Object.keys(next._authority.pendingSituations.queue)).toHaveLength(0) // 出队
    expect(next.events.resolvedEvents).toHaveLength(1) // 台账
  })

  it('保底记忆（§7.3 链③-2）：大事件词命中 → engine 来源 item 入档', () => {
    const big = sit({
      key: 'evt-grain-crisis#6',
      payload: {
        version: 1,
        title: '城内哗变',
        desc: '守军欠饷三月，今夜哗变。',
        options: [{ text: '躲进租界', effects: [] }],
        tags: ['war'],
      },
    })
    const tree = treeWithQueue(big)
    const r = resolveSituation({ key: 'evt-grain-crisis#6', optionIndex: 0 }, tree)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const write = r.effects.find((e) => e.op === 'memoryWrite')
    expect(write).toBeDefined()
    const item = write!.args.item as MemoryItemTree
    expect(item.importance).toBe(7) // ≥7 保底线
    expect(item.source).toBe('engine') // 保底来源可观测
    // 提交后 items 落档
    const runner = new TurnRunner()
    const commit = runner.commit(r.effects, tree)
    expect((commit.state as Tree).memory.items[item.id]).toBeDefined()
  })

  it('普通处境不产保底记忆（小额日常不值得引擎记）', () => {
    const tree = treeWithQueue(sit()) // 牌局：无大事件词
    const r = resolveSituation({ key: 'evt-street-gambling#6', optionIndex: 0 }, tree)
    if (!r.ok) throw new Error(r.message)
    expect(r.effects.some((e) => e.op === 'memoryWrite')).toBe(false)
  })

  it('结算零变更对照：拒绝路径世界零变更（LLM-29 同源）', () => {
    const tree = treeWithQueue(sit({ expiresAt: '1921-06-15' }))
    const r = resolveSituation({ key: 'evt-street-gambling#6', optionIndex: 0 }, tree)
    expect(r.ok).toBe(false)
    expect(sameWorld(tree, tree)).toBe(true) // 拒绝 = 不产出可提交效果，树不动
  })

  it('同 (situation, optionIndex, state) → 同 effects（M-10/B-09 确定性）', () => {
    const tree = treeWithQueue(sit())
    const a = resolveSituation({ key: 'evt-street-gambling#6', optionIndex: 0 }, tree)
    const b = resolveSituation({ key: 'evt-street-gambling#6', optionIndex: 0 }, tree)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

type MemoryItemTree = import('../../../src/validation/tree').MemoryItemTree
