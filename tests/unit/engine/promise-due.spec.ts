// tests/unit/engine/promise-due.spec.ts — VS-02 S-10 约定到期机检（L2 纯函数 + L4 并批）
//
// 失败判据覆盖（rebuild-v2.0/src/51-build-rings.md:164-193 九条中的第 ⑥ 条）：
//   ⑥ promise 到期处境**不挤占合池配额、不受单轮 ≤2 约束**（S-10 不变量 1：台账驱动直入）
// 附：S-10 错误语义（dueDate 缺失/不可解析 → 不入机检队列 + 注记，不猜日期）、
//     S-10 不变量 4（确定性：同 dueDate 同 monthIndex → 同注入）、
//     B-06 单次提交不破（机检并批进月推进的同一批提交，台账不互吃）。
// 命令：pnpm vitest run tests/unit/engine/promise-due.spec.ts
import { describe, it, expect } from 'vitest'
import { duePromiseSituations, PROMISE_LEDGER_PREFIX, type DayLogFactsView } from '../../../src/engine/events'
import { tickWorld } from '../../../src/turn/monthRunner'
import { initialTree, type PendingSituation } from '../../../src/validation/tree'
import { monthIndexFrom } from '../../../src/validation/calendar'

const MI = (date: string): number => monthIndexFrom(date)

const promise = (dueDate: string | undefined, what: string, to = '张掌柜') => ({
  kind: 'promise' as const,
  from: '我',
  to,
  ...(dueDate === undefined ? {} : { dueDate }),
  what,
})

const logs = (date: string, facts: unknown[]): DayLogFactsView => ({ date, facts })

/** 取出注入的 situationEnqueue 处境快照 */
const enqueued = (effects: readonly { op: string; args: Readonly<Record<string, unknown>> }[]): PendingSituation[] =>
  effects.filter((e) => e.op === 'situationEnqueue').map((e) => e.args.situation as PendingSituation)

describe('VS-02 判据⑥ S-10 到期机检：到期/逾期入队，未到期不入队', () => {
  it('dueDate = 当月（到期次月）→ 入队非空；处境快照齐全（表外 sentinel + 到期窗 ISO）', () => {
    const r = duePromiseSituations({
      date: '1921-08',
      monthIndex: MI('1921-08'),
      dayLogs: [logs('1921-07-01', [promise('1921-08', '还钱')])],
      queue: {},
    })
    expect(r.injectedKeys).toHaveLength(1)
    const sit = enqueued(r.effects)[0]
    expect(sit.key).toBe(r.injectedKeys[0])
    expect(sit.key.startsWith('promise#')).toBe(true)
    expect(sit.templateId).toBe('promise-due') // 表外 sentinel（Zod 只约束 min(1)）
    expect(sit.payload.title).toBe('还钱')
    expect(sit.payload.desc).toContain('1921-08')
    expect(sit.payload.tags).toEqual(['promise'])
    expect(sit.payload.options).toHaveLength(1)
    expect(sit.arrivedAt).toBe('1921-08-01')
    expect(sit.expiresAt).toBe('1921-10-01') // 与合池处境同到期窗（EXPIRY_MONTHS=2）
    expect(r.notes).toEqual([])
  })

  it('未到期（dueDate 晚于当月）→ 零注入（对照：证明入队不是恒真）', () => {
    const r = duePromiseSituations({
      date: '1921-07',
      monthIndex: MI('1921-07'),
      dayLogs: [logs('1921-07-01', [promise('1921-08', '还钱')])],
      queue: {},
    })
    expect(r.effects).toEqual([])
    expect(r.injectedKeys).toEqual([])
    expect(r.notes).toEqual([])
  })

  it('逾期补检（dueDate 早于当月）→ 照常入队（不漏账，按 dueDate 而非「刚好当月」匹配）', () => {
    const r = duePromiseSituations({
      date: '1921-11',
      monthIndex: MI('1921-11'),
      dayLogs: [logs('1921-07-01', [promise('1921-08', '还钱')])],
      queue: {},
    })
    expect(r.injectedKeys).toHaveLength(1)
  })

  it('dueDate 记 ISO 日形（YYYY-MM-DD）也受理（前缀解析），与月形同源', () => {
    const r = duePromiseSituations({
      date: '1921-08',
      monthIndex: MI('1921-08'),
      dayLogs: [logs('1921-07-01', [promise('1921-08-15', '还钱')])],
      queue: {},
    })
    expect(r.injectedKeys).toHaveLength(1)
  })
})

describe('VS-02 判据⑥ S-10 不变量 1：台账驱动直入 —— 不吃合池配额、不受 ≤2/模板 ≤1 约束', () => {
  it('队列已满 10 条 + 单轮合池上限（≤2）之上：3 条到期一次性全入队', () => {
    const queue: Record<string, unknown> = {}
    for (let i = 0; i < 10; i++) queue[`evt-${i}#26`] = { 占位: true } // 合池队列上限（E-3.4）已满
    const r = duePromiseSituations({
      date: '1921-08',
      monthIndex: MI('1921-08'),
      dayLogs: [
        logs('1921-07-01', [
          promise('1921-08', '还粮款', '甲'),
          promise('1921-07', '偿药费', '乙'),
          promise('1920-01', '旧欠', '丙'),
        ]),
      ],
      queue,
    })
    // 单轮处境 ≤2（§8.3）对合池生效，对机检台账不生效 —— 3 条全入
    expect(r.injectedKeys).toHaveLength(3)
    expect(enqueued(r.effects)).toHaveLength(3)
    // 注入键落在 promise 命名域（不与事件/模板 id 域相交，自证「不占配额」）
    expect(r.injectedKeys.every((k) => k.startsWith('promise#'))).toBe(true)
    expect(r.injectedKeys.every((k) => !(k in queue))).toBe(true)
  })

  it('队列接近上限也不因「队列满」而拒绝机检（配额是合池抽取的门，不是台账的门）', () => {
    const queue: Record<string, unknown> = {}
    for (let i = 0; i < 30; i++) queue[`tpl-${i}##${i}`] = {}
    const r = duePromiseSituations({
      date: '1921-08',
      monthIndex: MI('1921-08'),
      dayLogs: [logs('1921-07-01', [promise('1921-08', '还钱', '丁')])],
      queue,
    })
    expect(r.injectedKeys).toHaveLength(1)
  })
})

describe('VS-02 S-10 错误语义（降级）：dueDate 缺失/不可解析 → 不入机检队列 + 注记（不猜日期）', () => {
  it('三种坏 dueDate 全被拦下并逐条注记；同批好条目照常入队（坏块不拖垮好条目）', () => {
    const r = duePromiseSituations({
      date: '1921-08',
      monthIndex: MI('1921-08'),
      dayLogs: [
        logs('1921-07-01', [
          promise(undefined, '没有日期的约定', '甲'),
          promise('民国十年', '中文日期', '乙'),
          { kind: 'promise', from: '我', to: '丙', dueDate: 19210801, what: '数字日期' },
          promise('1921-08', '有日期的约定', '丁'),
        ]),
      ],
      queue: {},
    })
    expect(r.injectedKeys).toHaveLength(1)
    expect(enqueued(r.effects)[0].payload.title).toBe('有日期的约定')
    expect(r.notes).toHaveLength(3)
    expect(r.notes[0]).toMatch(/dueDate 缺失或不可解析.*不入机检队列/)
    expect(r.notes[0]).toContain('1921-07-01')
  })

  it('非 promise 的 facts（deal/move/situation/person/note）不参与机检（只认 kind 判别，不做文本解析）', () => {
    const r = duePromiseSituations({
      date: '1921-08',
      monthIndex: MI('1921-08'),
      dayLogs: [
        logs('1921-07-01', [
          { kind: 'deal', amount: 10, counterparty: '', what: '1921-08 到期还钱' }, // 文本像约定但不认
          { kind: 'note', text: 'promise 1921-08 dueDate' },
          { kind: 'person', name: '张掌柜' },
        ]),
      ],
      queue: {},
    })
    expect(r.injectedKeys).toEqual([])
    expect(r.notes).toEqual([])
  })
})

describe('VS-02 台账与确定性（S-10 不变量 4 / 失败判据⑤ 的机检侧）', () => {
  it('台账落账：键带 promise: 前缀、值为 ISO 日（compiler.ts eventsPost 值域要求）；同月重跑不重复注入', () => {
    const dayLogs = [logs('1921-07-01', [promise('1921-08', '还钱')])]
    const first = duePromiseSituations({ date: '1921-08', monthIndex: MI('1921-08'), dayLogs, queue: {} })
    const keys = Object.keys(first.ledgerAdditions)
    expect(keys).toHaveLength(1)
    expect(keys[0].startsWith(PROMISE_LEDGER_PREFIX)).toBe(true)
    expect(first.ledgerAdditions[keys[0]]).toBe('1921-08-01')
    expect(first.ledgerAdditions[keys[0]]).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // 重跑（带台账）→ 已机检，不重复注入
    const second = duePromiseSituations({
      date: '1921-08',
      monthIndex: MI('1921-08'),
      dayLogs,
      queue: {},
      eventCD: first.ledgerAdditions,
    })
    expect(second.injectedKeys).toEqual([])
    expect(second.ledgerAdditions).toEqual({})
  })

  it('同键已在队（未裁决）→ 幂等不重入；resolvedEvents 透传不灭（SAV 事实不灭）', () => {
    const dayLogs = [logs('1921-07-01', [promise('1921-08', '还钱')])]
    const first = duePromiseSituations({ date: '1921-08', monthIndex: MI('1921-08'), dayLogs, queue: {} })
    const inQueue = { [first.injectedKeys[0]]: {} }
    const second = duePromiseSituations({ date: '1921-08', monthIndex: MI('1921-08'), dayLogs, queue: inQueue })
    expect(second.injectedKeys).toEqual([])

    const resolved = [{ key: 'evt-x#1', templateId: 'evt-x', optionIndex: 0, resolvedAt: '1921-07-05' }]
    const third = duePromiseSituations({
      date: '1921-08',
      monthIndex: MI('1921-08'),
      dayLogs,
      queue: {},
      resolvedEvents: resolved,
    })
    expect(third.resolvedEvents).toEqual(resolved)
  })

  it('S-10 不变量 4 确定性：同 (dayLogs, date, monthIndex) → 结果逐字节一致；输入不被修改', () => {
    const dayLogs = [logs('1921-07-01', [promise('1921-08', '还钱'), promise(undefined, '无期')])]
    const snapshot = JSON.stringify(dayLogs)
    const a = duePromiseSituations({ date: '1921-08', monthIndex: MI('1921-08'), dayLogs, queue: {} })
    const b = duePromiseSituations({ date: '1921-08', monthIndex: MI('1921-08'), dayLogs, queue: {} })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(dayLogs)).toBe(snapshot) // 机检只读，不改 facts
    expect(a.injectedKeys).toEqual(b.injectedKeys)
  })
})

describe('VS-02 整合（B-06 单次提交不破）：tickWorld 并批机检', () => {
  it('机检与月推进同批提交：处境落树、台账落 ISO 日、既有 eventCD 不被覆盖', () => {
    const t = initialTree('era-warlord', '1921-08')
    t.events.eventCD['evt-old'] = '1921-01-01' // 预置既有冷却台账（模拟既有机检历史）

    const r = tickWorld(t, { dayLogs: [logs('1921-07-01', [promise('1921-08', '还钱')])] })
    expect(r.ok).toBe(true)
    expect(r.dueInjected).toHaveLength(1)
    expect(r.dueNotes).toEqual([])

    const key = r.dueInjected![0]
    expect(r.state._authority.pendingSituations.queue[key].templateId).toBe('promise-due')
    const cd = r.state.events.eventCD
    expect(cd['evt-old']).toBe('1921-01-01') // 并批未把既有台账吃掉（第二条 eventsPost 覆盖保护的回归断言）
    expect(Object.keys(cd).some((k) => k.startsWith(PROMISE_LEDGER_PREFIX))).toBe(true)
    // 机检处境不在合池配额内本次是否入队，由 dueInjected 单独给证（合池侧 ≤2 仍由 events.spec.ts 守）
    expect(r.writtenDomains.length).toBeGreaterThan(0)
    expect(r.effects?.some((e) => e.op === 'eventsPost')).toBe(true)
  })

  it('台账驱动直入的证据面：同一棵树重复 tick 不重复注入（第二次因台账已存在）', () => {
    const t = initialTree('era-warlord', '1921-08')
    const logsIn = [logs('1921-07-01', [promise('1921-08', '还钱')])]
    const first = tickWorld(t, { dayLogs: logsIn })
    expect(first.dueInjected).toHaveLength(1)
    const second = tickWorld(first.state, { dayLogs: logsIn })
    expect(second.dueInjected).toEqual([]) // 台账已机检 → 不重入
    expect(Object.keys(second.state.events.eventCD).some((k) => k.startsWith(PROMISE_LEDGER_PREFIX))).toBe(true)
  })

  it('向后兼容：不传 dayLogs（既有调用点）→ 零机检注入，月推进行为不变', () => {
    const t = initialTree('era-warlord', '1921-08')
    const r = tickWorld(t)
    expect(r.ok).toBe(true)
    expect(r.dueInjected).toEqual([])
    expect(r.dueNotes).toEqual([])
  })

  it('dueDate 坏条目经 tickWorld 也走降级：注记随结果上抛，不静默', () => {
    const t = initialTree('era-warlord', '1921-08')
    const r = tickWorld(t, { dayLogs: [logs('1921-07-01', [promise(undefined, '没写日期的约定')])] })
    expect(r.ok).toBe(true)
    expect(r.dueInjected).toEqual([])
    expect(r.dueNotes).toHaveLength(1)
  })
})
