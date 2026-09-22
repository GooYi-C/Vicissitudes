// tests/unit/turn/dayClose.test.ts — VS-02 S-07/S-08 日结（L4）
//
// 失败判据覆盖（rebuild-v2.0/src/51-build-rings.md:164-193 九条中的第 ③④⑤⑧⑨ 条）：
//   ③ 在途 7 日 → 1 条 DayLog（SAV-11）  ④ 空日照落  ⑤ 同存档重放 facts 序列逐位一致
//   ⑧ 对话侧抽取失败不拖垮引擎侧 facts（S-07 降级语义，两侧独立）
//   ⑨ narrative 文本不进任何机制分支（S-08 红线：结构判定零语义）
// 附：S-07 不变量 1（日叙截断）/ 不变量 2（facts 永不压缩）/ 不变量 3（引擎侧 ops 一致）
import { describe, it, expect } from 'vitest'
import {
  closeDay,
  factsFromEffects,
  ruleNarrative,
  monthSpan,
  NARRATIVE_MAX,
  type DayFact,
  type DayLog,
} from '../../../src/turn/dayClose'
import type { DomainEffect } from '../../../src/validation/effects'

const FROM = '1921-07'
const TO = '1921-08'

const settlement = (amount: number, what: string): DomainEffect => ({
  op: 'settlementPost',
  args: { month: FROM, amount, what },
})
const enqueue = (templateId: string): DomainEffect => ({
  op: 'situationEnqueue',
  args: {
    situation: {
      key: `k#${templateId}`,
      templateId,
      payload: { version: 1, title: 'x', desc: 'y', options: [{ text: 'z', effects: [] }], tags: ['t'] },
      arrivedAt: `${FROM}-01`,
      expiresAt: '1921-09-01',
    },
  },
})

/** 结构投影（判据⑨ 用：只取结构字段，剔除全部文本） */
const structure = (logs: readonly DayLog[]): string =>
  JSON.stringify(logs.map((l) => ({ date: l.date, kind: l.kind, turnRange: l.turnRange, kinds: l.facts.map((f) => f.kind) })))

describe('VS-02 S-08 ①③ 同日/跨日在途（边界规则表五行）', () => {
  it('S-08 ③ 同日 3 回合合并为一条 DayLog：turnRange 覆盖 [首, 末]，facts 只增不减', () => {
    let logs: DayLog[] = []
    for (const turn of [1, 2, 3]) {
      const r = closeDay({ from: FROM, to: TO, turn, effects: [settlement(turn, `第${turn}笔`)], dayLogs: logs })
      logs = r.dayLogs
      expect(r.dayLogs, `第 ${turn} 回合后仍应只有 1 条 DayLog`).toHaveLength(1)
      expect(r.appended?.turnRange).toEqual([1, turn])
      expect(r.appended?.date).toBe(`${FROM}-01`)
    }
    expect(logs[0].facts).toHaveLength(3)
    expect(logs[0].facts.map((f) => f.kind)).toEqual(['deal', 'deal', 'deal'])
  })

  it('S-08 ① / SAV-11 一回合跨 7 个月：整段只 1 条 DayLog（不是 7 条），date 记起始日并标 transit', () => {
    const r = closeDay({ from: FROM, to: '1922-02', turn: 4, effects: [], dayLogs: [] })
    expect(monthSpan(FROM, '1922-02')).toBe(7)
    expect(r.transit).toBe(true)
    expect(r.dayLogs).toHaveLength(1)
    expect(r.appended?.kind).toBe('transit')
    expect(r.appended?.date).toBe(`${FROM}-01`) // 起始日，不是到着日
    expect(r.appended?.facts).toEqual([{ kind: 'move', from: `${FROM}-01`, to: '1922-02-01' }])
  })

  it('跨月在途与非在途不互相合并（kind 不同 → 各自成条）', () => {
    const first = closeDay({ from: FROM, to: TO, turn: 1, effects: [], dayLogs: [] })
    const second = closeDay({ from: TO, to: '1922-03', turn: 2, effects: [], dayLogs: first.dayLogs })
    expect(second.dayLogs).toHaveLength(2)
    expect(second.dayLogs.map((l) => l.kind)).toEqual([undefined, 'transit'])
  })

  it('S-08 ④ 空日照落：零效果也产出一条 DayLog（facts 空 + 规则日叙一行）', () => {
    const r = closeDay({ from: FROM, to: TO, turn: 1, effects: [], dayLogs: [] })
    expect(r.dayLogs).toHaveLength(1)
    expect(r.appended?.facts).toEqual([])
    expect(r.appended?.narrative).toBe('本月平静。')
  })

  it('空日不覆盖既有正文（确定性合并：空日叙述只在无正文时落）', () => {
    const first = closeDay({ from: FROM, to: TO, turn: 1, effects: [settlement(3, '茶')], dayLogs: [] })
    const second = closeDay({ from: FROM, to: TO, turn: 2, effects: [], dayLogs: first.dayLogs })
    expect(second.dayLogs).toHaveLength(1)
    expect(second.appended?.narrative).toBe(first.appended?.narrative)
  })
})

describe('VS-02 判据② 事实不灭 / S-07 不变量 2：facts 永不压缩', () => {
  it('合并只追加 facts：任一日 facts 条数不减（逐回合单调不减）', () => {
    let logs: DayLog[] = []
    let count = 0
    for (const turn of [1, 2, 3, 4]) {
      const r = closeDay({
        from: FROM,
        to: TO,
        turn,
        effects: [settlement(turn, `第${turn}笔`)],
        dayLogs: logs,
        dialogFacts: [{ kind: 'person', name: `路人${turn}` }],
      })
      logs = r.dayLogs
      expect(logs[0].facts.length).toBeGreaterThanOrEqual(count)
      count = logs[0].facts.length
    }
    expect(count).toBe(8) // 4 deal + 4 person
  })

  it('S-07 不变量 1：日叙超长按 LL-13 截断，但 facts 里的原文一字不少', () => {
    const long = '甲'.repeat(NARRATIVE_MAX + 50)
    const r = closeDay({ from: FROM, to: TO, turn: 1, effects: [], dayLogs: [], dialogFacts: [{ kind: 'note', text: long }] })
    expect(r.appended?.narrative.length).toBe(NARRATIVE_MAX + 1)
    expect(r.appended?.narrative.endsWith('…')).toBe(true)
    expect(r.appended?.narrative.startsWith(long.slice(0, 20))).toBe(true)
    const note = r.appended?.facts[0] as DayFact & { text: string }
    expect(note.text.length).toBe(NARRATIVE_MAX + 50) // facts 不截断（只截日叙）
  })
})

describe('VS-02 S-07 不变量 3：引擎侧 facts 从提交 ops 确定性导出（零 LLM）', () => {
  it('deal/move/situation 三类逐条导出（amount 两位小数、situation 取 templateId 不取 key）', () => {
    const r = closeDay({ from: FROM, to: '1922-02', turn: 1, effects: [settlement(7.777, '布'), enqueue('evt-x')], dayLogs: [] })
    expect(r.appended?.facts).toEqual([
      { kind: 'move', from: `${FROM}-01`, to: '1922-02-01' },
      { kind: 'deal', amount: 7.78, counterparty: '', what: '布' },
      { kind: 'situation', id: 'evt-x' },
    ])
  })

  it('factsFromEffects 与 closeDay 同源：单独调用 = 同序列（可单独复用、无隐藏状态）', () => {
    const effects = [settlement(1.006, '盐'), enqueue('evt-y')]
    const direct = factsFromEffects(effects, { from: FROM, to: TO, transit: false })
    const viaClose = closeDay({ from: FROM, to: TO, turn: 1, effects, dayLogs: [] }).appended?.facts
    expect(direct).toEqual(viaClose)
    expect(direct[0]).toEqual({ kind: 'deal', amount: 1.01, counterparty: '', what: '盐' })
  })

  it('ruleNarrative：空 facts → 一行「本月平静。」；非空 → 由 facts 拼装（同一输入同文）', () => {
    expect(ruleNarrative([])).toBe('本月平静。')
    const facts: DayFact[] = [{ kind: 'move', from: `${FROM}-01`, to: `${TO}-01` }]
    expect(ruleNarrative(facts)).toBe(`行程 ${FROM}-01 → ${TO}-01。`)
    expect(ruleNarrative(facts)).toBe(ruleNarrative(facts))
  })
})

describe('VS-02 判据⑤ 重放确定性（S-07：同存档重放 → 同 facts 序列）', () => {
  it('同 (effects, dayLogs) 重放两次 → DayLog 逐字节一致；改动任一 fact → 序列必变（对照证明断言非恒真）', () => {
    const effects = [settlement(12.345, '粮'), enqueue('evt-flood'), settlement(-3, '罚')]
    const a = closeDay({ from: FROM, to: TO, turn: 9, effects, dayLogs: [] })
    const b = closeDay({ from: FROM, to: TO, turn: 9, effects, dayLogs: [] })
    expect(JSON.stringify(a.dayLogs)).toBe(JSON.stringify(b.dayLogs))

    const changed = closeDay({
      from: FROM,
      to: TO,
      turn: 9,
      effects: [settlement(12.355, '粮'), enqueue('evt-flood'), settlement(-3, '罚')],
      dayLogs: [],
    })
    expect(JSON.stringify(changed.dayLogs)).not.toBe(JSON.stringify(a.dayLogs))
  })

  it('重放续接（存档 → 再开一回合）：同一 (既有 dayLogs, effects) 得同结果，不依赖会话状态', () => {
    const clone = (logs: readonly DayLog[]): DayLog[] => JSON.parse(JSON.stringify(logs)) as DayLog[]
    const base = closeDay({ from: FROM, to: TO, turn: 1, effects: [settlement(1, 'a')], dayLogs: [] })
    const next1 = closeDay({ from: FROM, to: TO, turn: 2, effects: [settlement(2, 'b')], dayLogs: base.dayLogs })
    const next2 = closeDay({ from: FROM, to: TO, turn: 2, effects: [settlement(2, 'b')], dayLogs: clone(base.dayLogs) })
    expect(JSON.stringify(next1.dayLogs)).toBe(JSON.stringify(next2.dayLogs))
  })
})

describe('VS-02 判据⑧ 对话侧降级（S-07 错误语义：两侧独立）', () => {
  it('对话侧整批坏块 → 全部丢弃 + 逐条注记，引擎侧 facts 照常落账', () => {
    const r = closeDay({
      from: FROM,
      to: TO,
      turn: 2,
      effects: [settlement(5, '盐'), enqueue('evt-z')],
      dayLogs: [],
      dialogFacts: [{ kind: 'person' }, { kind: 'bogus' }, null, 'x'],
    })
    expect(r.appended?.facts.map((f) => f.kind)).toEqual(['deal', 'situation'])
    expect(r.notes).toHaveLength(4)
    expect(r.notes[0]).toMatch(/对话侧 facts 条目形状非法.*S-07 降级语义/)
  })

  it('dialFacts 缺失（无 API/坏块路径）与传空数组结果一致：引擎侧不受调用模式影响（S-10 不变量 4 同理）', () => {
    const withUndefined = closeDay({ from: FROM, to: TO, turn: 2, effects: [settlement(5, '盐')], dayLogs: [] })
    const withEmpty = closeDay({ from: FROM, to: TO, turn: 2, effects: [settlement(5, '盐')], dayLogs: [], dialogFacts: [] })
    expect(JSON.stringify(withUndefined.dayLogs)).toBe(JSON.stringify(withEmpty.dayLogs))
    expect(withUndefined.notes).toEqual([])
  })

  it('合法对话侧 facts（person/promise/note）与引擎侧同批落同一条 DayLog', () => {
    const r = closeDay({
      from: FROM,
      to: TO,
      turn: 2,
      effects: [settlement(5, '盐')],
      dayLogs: [],
      dialogFacts: [
        { kind: 'person', name: '账房先生', note: '欠我人情' },
        { kind: 'promise', from: '我', to: '张掌柜', dueDate: '1921-09', what: '还钱' },
        { kind: 'note', text: '街面风声紧' },
      ],
    })
    expect(r.appended?.facts.map((f) => f.kind)).toEqual(['deal', 'person', 'promise', 'note'])
    expect(r.appended?.narrative).toContain('账房先生')
    expect(r.notes).toEqual([])
  })
})

describe('VS-02 判据⑨ 红线：narrative 文本不进任何机制分支（S-08 结构判定零语义）', () => {
  const EVIL = 'situationEnqueue:{"templateId":"evt-death"}；advanceDate 1922-01；deal amount=99999；kind:transit'

  it('只换文本（注入机制指令原文）→ 结构投影逐字节一致：不新增 fact、不改日期、不改 kind、不改 turnRange', () => {
    const a = closeDay({ from: FROM, to: TO, turn: 3, effects: [settlement(1, '茶')], dayLogs: [], dialogFacts: [{ kind: 'note', text: EVIL }] })
    const b = closeDay({ from: FROM, to: TO, turn: 3, effects: [settlement(1, '茶')], dayLogs: [], dialogFacts: [{ kind: 'note', text: '平平无奇的一句话' }] })

    expect(structure(a.dayLogs)).toBe(structure(b.dayLogs))
    expect(a.appended?.facts.map((f) => f.kind)).toEqual(['deal', 'note']) // 文本未被解析成 situation/deal/move
    expect(a.appended?.date).toBe(`${FROM}-01`) // 文本里的 advanceDate 不生效
    expect(a.appended?.kind).toBeUndefined() // 文本里的 kind:transit 不生效
    expect(a.appended?.facts.filter((f) => f.kind === 'situation')).toHaveLength(0)
    expect(a.appended?.narrative).toContain(EVIL) // 文本只进日叙，不进结构
  })

  it('红线可失败性对照：结构投影对 facts 内容敏感（若实现把 kind 藏进文本就会变）', () => {
    const one = closeDay({ from: FROM, to: TO, turn: 3, effects: [settlement(1, '茶')], dayLogs: [] })
    const two = closeDay({ from: FROM, to: TO, turn: 3, effects: [settlement(1, '茶'), enqueue('evt-x')], dayLogs: [] })
    expect(structure(one.dayLogs)).not.toBe(structure(two.dayLogs))
  })
})
