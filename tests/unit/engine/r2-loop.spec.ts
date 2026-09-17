// tests/unit/engine/r2-loop.spec.ts — R2 出口判据：序章可走、处境入队可见、了结走结算管道、记忆三源写入
// §二十九 R2 环卡：全程可在免 API 条件下自证（SKL 门 2 的延续）。
import { describe, it, expect } from 'vitest'
import { tickWorld } from '../../../src/turn/monthRunner'
import { resolveSituation } from '../../../src/turn/resolves'
import { initialTree, type Tree } from '../../../src/validation/tree'
import { sameWorld, TurnRunner } from '../../../src/turn/TurnRunner'
import { evaluate } from '../../../src/stores/selectors/runtime'
import { worldSituations } from '../../../src/stores/selectors'

describe('R2 出口判据：处境环 12 月闭环（免 API 自证）', () => {
  it('12 月零报错：处境逐月入队（免 API 下处境卡出现）+ 冷却轮转 + 过期清位', () => {
    let tree = initialTree('era-warlord', '1921-07')
    let monthsWithSituations = 0
    let totalEnqueued = 0
    for (let i = 0; i < 12; i++) {
      const r = tickWorld(tree)
      expect(r.ok, `第 ${i + 1} 月：${r.error}`).toBe(true)
      tree = r.state as Tree
      const q = Object.keys(tree._authority.pendingSituations.queue)
      if (q.length > 0) monthsWithSituations++
      totalEnqueued += q.length
    }
    // 处境入队可见：12 月中至少多数月份有处境卡（SKL 门 2 —— 免 API 处境卡出现）
    expect(monthsWithSituations).toBeGreaterThanOrEqual(8)
    expect(totalEnqueued).toBeGreaterThan(0)
    // 冷却轮转台账健康：CD 表有条目、队列不膨胀（≤10 上限）
    expect(Object.keys(tree.events.eventCD).length).toBeGreaterThan(0)
    expect(Object.keys(tree._authority.pendingSituations.queue).length).toBeLessThanOrEqual(10)
  })

  it('了结走结算管道：入队 → 玩家点选 → TurnRunner 提交 → 出队 + 台账 + 拒绝重放', () => {
    let tree = initialTree('era-warlord', '1921-07')
    // 推到有处境的月份
    let sitKey = ''
    for (let i = 0; i < 6 && !sitKey; i++) {
      const r = tickWorld(tree)
      if (!r.ok) throw new Error(r.error)
      tree = r.state as Tree
      const keys = Object.keys(tree._authority.pendingSituations.queue)
      if (keys.length > 0) sitKey = keys[0]
    }
    expect(sitKey).not.toBe('') // 6 月内必有处境
    // 玩家点选（optionIndex 0）→ 结算管道
    const resolve = resolveSituation({ key: sitKey, optionIndex: 0 }, tree)
    expect(resolve.ok, (resolve as { message?: string }).message).toBe(true)
    if (!resolve.ok) return
    // B-06 单次提交：经 TurnRunner 原子落账
    const runner = new TurnRunner()
    const commit = runner.commit(resolve.effects, tree)
    expect(commit.ok, commit.error).toBe(true)
    const next = commit.state as Tree
    // 出队 + 台账
    expect(next._authority.pendingSituations.queue[sitKey]).toBeUndefined()
    expect(next.events.resolvedEvents.some((e) => e.key === sitKey)).toBe(true)
    // 陈旧引用重放 → 拒绝（B-09-2 防重复结算）
    const replay = resolveSituation({ key: sitKey, optionIndex: 0 }, next)
    expect(replay.ok).toBe(false)
  })

  it('记忆三源写入：保底源（engine）在大事件结算后入档；管家月度维护不灭事实', () => {
    let tree = initialTree('era-warlord', '1921-07')
    // 12 月过月：管家维护跑满（有 items 时衰减；空时幂等）
    for (let i = 0; i < 12; i++) {
      const r = tickWorld(tree)
      if (!r.ok) throw new Error(r.error)
      tree = r.state as Tree
    }
    // 注入一条大事件处境 → 结算 → 保底记忆入档（§7.3 链③-2）
    const bigKey = 'evt-mutiny#test'
    const base = tree
    const withSit: Tree = {
      ...base,
      _authority: {
        ...base._authority,
        pendingSituations: {
          queue: {
            ...base._authority.pendingSituations.queue,
            [bigKey]: {
              key: bigKey, templateId: 'evt-mutiny',
              payload: { version: 1, title: '守军哗变', desc: '欠饷三月，今夜哗变。', options: [{ text: '闭门不出', effects: [] }], tags: ['war'] },
              arrivedAt: `${base.world.date}-01`, expiresAt: '1949-12-31',
            },
          },
        },
      },
    }
    const resolve = resolveSituation({ key: bigKey, optionIndex: 0 }, withSit)
    expect(resolve.ok).toBe(true)
    if (!resolve.ok) return
    // B-06 单次提交：经 TurnRunner 原子落账
    const runner2 = new TurnRunner()
    const commit = runner2.commit(resolve.effects, withSit)
    expect(commit.ok, commit.error).toBe(true)
    const after = commit.state as Tree
    const items = Object.values(after.memory.items)
    expect(items.some((m) => m.source === 'engine' && m.importance === 7)).toBe(true)
    // 管家维护跑一月：事实不灭（content/title/id 不变，只动元数据）
    const r2 = tickWorld(after)
    expect(r2.ok, r2.error).toBe(true)
    const maintained = r2.state as Tree
    for (const [id, m] of Object.entries(after.memory.items)) {
      const kept = maintained.memory.items[id]
      expect(kept, id).toBeDefined()
      expect(kept.content).toBe(m.content)
    }
  })

  it('月度目标池常驻：每月 ≤3 条、exhausted 剔除生效', () => {
    let tree = initialTree('era-warlord', '1921-07')
    for (let i = 0; i < 12; i++) {
      const r = tickWorld(tree)
      if (!r.ok) throw new Error(r.error)
      tree = r.state as Tree
      expect(tree.goals.pool.length).toBeLessThanOrEqual(3)
      expect(tree.goals.pool.length).toBeGreaterThan(0)
    }
  })

  it('两次运行逐位一致（B-02/ARC-5：R2 月级体现）', () => {
    const run = (): Tree => {
      let tree = initialTree('era-warlord', '1921-07')
      for (let i = 0; i < 12; i++) {
        const r = tickWorld(tree)
        if (!r.ok) throw new Error(r.error)
        tree = r.state as Tree
      }
      return tree
    }
    expect(sameWorld(run(), run())).toBe(true)
  })

  it('selector 读通道：处境卡数据可见（U-03 —— 面板读通道非空）', () => {
    let tree = initialTree('era-warlord', '1921-07')
    for (let i = 0; i < 3; i++) {
      const r = tickWorld(tree)
      if (!r.ok) throw new Error(r.error)
      tree = r.state as Tree
    }
    const cards = evaluate(worldSituations, tree, {})
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0].key).toBeTruthy()
  })
})

