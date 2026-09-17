// tests/unit/engine/events.spec.ts — R2-1 events：三源合池 + 冷却 + 氛围窗口 + 约束抽取（§8.3）
import { describe, it, expect } from 'vitest'
import { events } from '../../../src/engine/events'
import { initialTree, type Tree, type PendingSituation } from '../../../src/validation/tree'
import { deriveRng } from '../../../src/engine/rng'
import { events as dataEvents } from '../../../src/data/events'
import { situationTemplates } from '../../../src/data/situationTemplates'
import { compile } from '../../../src/turn/compiler'
import { TurnRunner } from '../../../src/turn/TurnRunner'
import { tickWorld } from '../../../src/turn/monthRunner'

function ctxFor(monthIndex: number) {
  return {
    date: '1921-07', monthIndex,
    rng: (salt: string) => deriveRng('events', monthIndex, salt),
    market: {}, diagnostics: [], state: {},
  }
}

function treeAt(eraId: string, date: string): Tree {
  return initialTree(eraId, date)
}

// 提取本月入队的处境（从效果流解析 situationEnqueue）
function enqueued(effects: ReturnType<typeof events.collect>): PendingSituation[] {
  return effects.filter((e) => e.op === 'situationEnqueue').map((e) => e.args.situation as PendingSituation)
}

describe('R2-1 events 触发管道', () => {
  it('入队产出：单月 ≤2 处境、模板侧 ≤1（§8.3 约束）', () => {
    // 连跑多月采样（不同 monthIndex 抽样序列不同）
    for (let m = 0; m < 24; m++) {
      const tree = treeAt('era-warlord', '1921-07')
      const sit = enqueued(events.collect(tree as never, ctxFor(m) as never))
      expect(sit.length, `monthIndex ${m}`).toBeLessThanOrEqual(2)
      const templates = sit.filter((s) => s.templateId.startsWith('tmpl-'))
      expect(templates.length, `monthIndex ${m}`).toBeLessThanOrEqual(1)
    }
  })

  it('冷却：入过队的 id 台账落 CD；冷却期内不再入队（真实月差）', () => {
    const tree = treeAt('era-warlord', '1921-07')
    // 预置台账：evt-rice-panic 1921-06 入队（monthIndex 5；cooldownMonths 4 → 月序 < 9 被拦）
    const seeded: Tree = {
      ...tree,
      events: { eventCD: { 'evt-rice-panic': '1921-06-01' }, resolvedEvents: [] },
    }
    for (let m = 0; m < 9; m++) {
      const sit = enqueued(events.collect(seeded as never, ctxFor(m) as never))
      expect(sit.some((s) => s.templateId === 'evt-rice-panic'), `monthIndex ${m}（冷却 4 月内：last=5, 拦 m<9）`).toBe(false)
    }
  })

  it('冷却解除：台账日期早于冷却期 → 重新可入队', () => {
    const tree = treeAt('era-warlord', '1921-07')
    const seeded: Tree = {
      ...tree,
      events: { eventCD: { 'evt-rice-panic': '1921-01-01' }, resolvedEvents: [] }, // 6 月前 → 冷却已过
    }
    let requeued = false
    for (let m = 0; m < 60; m++) {
      const sit = enqueued(events.collect(seeded as never, ctxFor(m) as never))
      if (sit.some((s) => s.templateId === 'evt-rice-panic')) { requeued = true; break }
    }
    expect(requeued).toBe(true)
  })

  it('年代门：evt-militia-levy（1921–1937）在 1940 年被过滤', () => {
    const tree = treeAt('era-resistance', '1940-07')
    for (let m = 0; m < 48; m++) {
      const sit = enqueued(events.collect(tree as never, ctxFor(m) as never))
      expect(sit.some((s) => s.templateId === 'evt-militia-levy'), `monthIndex ${m}`).toBe(false)
    }
  })

  it('队列满（10 条）→ 本月零抽取；过期条目被引擎清位（LL-05 卫生）', () => {
    const base = treeAt('era-warlord', '1921-07')
    // 预置 10 条未过期处境
    const queue: Record<string, PendingSituation> = {}
    for (let i = 0; i < 10; i++) {
      const key = `occupied#${i}`
      queue[key] = {
        key, templateId: 'tmpl-illness',
        payload: { version: 1, title: '占位', desc: 'x', options: [{ text: 'a', effects: [] }], tags: ['society'] },
        arrivedAt: '1921-06-01', expiresAt: '1921-08-01',
      }
    }
    const full: Tree = { ...base, _authority: { ...base._authority, pendingSituations: { queue } } }
    const effects = events.collect(full as never, ctxFor(6) as never)
    expect(enqueued(effects)).toHaveLength(0) // 满 → 不抽

    // 过期场景：10 条全部过期 → 出队 10 条 + 照常抽取新处境
    const expired: Record<string, PendingSituation> = {}
    for (let i = 0; i < 10; i++) {
      const key = `stale#${i}`
      expired[key] = { ...queue[`occupied#${i}`], key, expiresAt: '1921-06-15' }
    }
    const stale: Tree = { ...base, _authority: { ...base._authority, pendingSituations: { queue: expired } } }
    const eff2 = events.collect(stale as never, ctxFor(6) as never)
    const dequeues = eff2.filter((e) => e.op === 'situationDequeue')
    expect(dequeues).toHaveLength(10)
    expect(enqueued(eff2).length).toBeGreaterThan(0)
  })

  it('payload 快照往返零丢失（EVT-7）：入队 → 提交 → 重读 payload 逐字段一致', () => {
    const tree = treeAt('era-warlord', '1921-07')
    const effects = events.collect(tree as never, ctxFor(6) as never)
    const sit = enqueued(effects)[0]
    expect(sit).toBeDefined()
    // 提交整批（TurnRunner 原子提交）
    const runner = new TurnRunner()
    const commit = runner.commit(effects, tree)
    expect(commit.ok, commit.error).toBe(true)
    // 重读：queue 内 payload 与原始逐字段一致（快照不依赖运行时定义表）
    const stored = (commit.state as Tree)._authority.pendingSituations.queue[sit.key]
    expect(stored).toBeDefined()
    expect(stored.payload.title).toBe(sit.payload.title)
    expect(stored.payload.desc).toBe(sit.payload.desc)
    expect(stored.payload.options).toEqual(sit.payload.options)
    expect(stored.payload.tags).toEqual(sit.payload.tags)
  })

  it('rng 确定性（EVT-8）：同 (monthIndex, salt) 抽取序列逐位一致', () => {
    const tree = treeAt('era-warlord', '1921-07')
    const a = events.collect(tree as never, ctxFor(6) as never)
    const b = events.collect(tree as never, ctxFor(6) as never)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const c = events.collect(tree as never, ctxFor(7) as never)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c)) // 月序参与派生
  })

  it('五时代双向差异（EVT-3）：相邻时代同推 12 月处境池差异非空', () => {
    const run = (eraId: string, date: string): string[] => {
      let tree = treeAt(eraId, date)
      const seen: string[] = []
      for (let i = 0; i < 12; i++) {
        const r = tickWorld(tree)
        if (!r.ok) throw new Error(r.error)
        tree = r.state as Tree
        for (const s of Object.values(tree._authority.pendingSituations.queue)) seen.push(s.templateId)
      }
      return seen
    }
    const warlord = run('era-warlord', '1921-07')
    const resistance = run('era-resistance', '1937-07')
    // 差异非空：两时代处境合集不同（年代门 + 氛围窗口共同起效）
    const onlyWarlord = warlord.filter((x) => !resistance.includes(x))
    const onlyResist = resistance.filter((x) => !warlord.includes(x))
    expect(onlyWarlord.length + onlyResist.length, '两时代处境池应有差异').toBeGreaterThan(0)
  })

  it('合池采样（EVT-4）：模板侧占比有界（约三成量级）', () => {
    // 采样 60 月（五个月序种子 × 12 月）
    let templateCount = 0
    let totalCount = 0
    for (let m = 0; m < 60; m++) {
      const tree = treeAt('era-warlord', '1921-07')
      const sit = enqueued(events.collect(tree as never, ctxFor(m) as never))
      totalCount += sit.length
      templateCount += sit.filter((s) => s.templateId.startsWith('tmpl-')).length
    }
    expect(totalCount).toBeGreaterThan(0)
    const ratio = templateCount / totalCount
    // 模板 0.5× 权重 × ≤1/月约束 → 占比上界显著低于硬事件（0.5×/月 vs 2×/月）
    expect(ratio).toBeLessThan(0.5) // 约三成量级（EVT-4）
    expect(ratio).toBeGreaterThanOrEqual(0) // 下界：可为 0（单月模板弃位）
  })

  it('台账落账：入队月 eventCD 记 ISO 日期；resolvedEvents 透传不灭（SAV 事实不灭）', () => {
    const tree = treeAt('era-warlord', '1921-07')
    const seeded: Tree = {
      ...tree,
      events: { eventCD: {}, resolvedEvents: [{ key: 'old#0', templateId: 'tmpl-illness', optionIndex: 0, resolvedAt: '1921-06-01' }] },
    }
    const effects = events.collect(seeded as never, ctxFor(6) as never)
    const post = effects.find((e) => e.op === 'eventsPost')
    expect(post).toBeDefined()
    const args = post!.args as { eventCD: Record<string, string>; resolvedEvents: unknown[] }
    expect(Object.keys(args.eventCD).length).toBeGreaterThan(0) // 新入队 id 记 CD
    expect(args.resolvedEvents).toHaveLength(1) // 旧结算史透传
    for (const v of Object.values(args.eventCD)) expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('effects 可编译（B-07）：整批过 compiler 无非法 op', () => {
    const tree = treeAt('era-warlord', '1921-07')
    const effects = events.collect(tree as never, ctxFor(6) as never)
    expect(() => compile(effects, tree)).not.toThrow()
  })

  it('全库 id 唯一：事件表与模板表无交叉 id（DAT 侧）', () => {
    const ids = [...dataEvents.map((e) => e.id), ...situationTemplates.map((t) => t.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })
})
