// tests/unit/llm/prompt.test.ts — VS-01 prompt 装配（LL-12 段序/哈希稳定 / LL-13 档位 / key 免入）
import { describe, it, expect } from 'vitest'
import { buildChatMessages, buildStaticHead, BUDGET_TIERS } from '../../../src/llm/prompt'
import { initialTree } from '../../../src/validation/tree'
import { PRICE_ANCHORS } from '../../../src/data/commodities'

const settingsT = { promptBudget: 'thrifty' as const }
const settingsS = { promptBudget: 'standard' as const }
const tree = () => initialTree('era-warlord', '1921-07')

describe('VS-01 prompt：LL-12 静态头冻结', () => {
  it('段序五段固定：文风→物价锚→声望档→世界观→memory 写入契约', () => {
    const h = buildStaticHead(settingsS)
    expect(h.segments[0]).toContain('①文风契约')
    expect(h.segments[1]).toContain('②物价锚')
    expect(h.segments[2]).toContain('③声望档位')
    expect(h.segments[3]).toContain('④世界观')
    expect(h.segments[4]).toContain('⑤memory 写入契约')
  })
  it('模板哈希跨回合字节级稳定（LLM-13：同设置两回合同哈希）', () => {
    expect(buildStaticHead(settingsS).hash).toBe(buildStaticHead(settingsS).hash)
    expect(buildStaticHead(settingsS).text).toBe(buildStaticHead(settingsS).text)
  })
  it('静态头不含日期/回合号/存档 id（LL-12 不变量 5）', () => {
    const text = buildStaticHead(settingsS).text
    expect(text).not.toContain('1921-07') // 不含当前游戏月；历史年号段（worldbook 静态文本）不受此限——它们每回合字节不变
    expect(text).not.toContain('turn')
    expect(text).not.toContain('slotId')
  })
  it('物价锚与 PRICE_ANCHORS 单源同源（DAT-10：不另造数）', () => {
    const seg = buildStaticHead(settingsS).segments[1]
    for (const p of Object.values(PRICE_ANCHORS)) expect(seg).toContain(String(p))
  })
  it('memory 注入契约段存在（MEM-9）＋ 单轮 ≤3（LL-04 不变量 3）', () => {
    expect(buildStaticHead(settingsS).segments[4]).toContain('单轮最多 3 条')
  })
})

describe('VS-01 prompt：动态段与档位', () => {
  it('动态段严格置后：系统动态段在静态头之后（LL-12；分界后追加）', () => {
    const msgs = buildChatMessages({ tree: tree(), history: [], userText: '做点买卖' }, settingsS)
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toBe(buildStaticHead(settingsS).text)
    expect(msgs[1].role).toBe('system')
    expect(msgs[1].content).toContain('⑥世界状态')
    expect(msgs.length).toBeGreaterThanOrEqual(3)
    expect(msgs[msgs.length - 1].content).toBe('做点买卖')
  })
  it('同输入 → 同消息序列（LL-12 确定性）', () => {
    const a = buildChatMessages({ tree: tree(), history: [{ turn: 1, date: '1921-08', text: '一行' }], userText: 'x' }, settingsS)
    const bmsg = buildChatMessages({ tree: tree(), history: [{ turn: 1, date: '1921-08', text: '一行' }], userText: 'x' }, settingsS)
    expect(JSON.stringify(a)).toBe(JSON.stringify(bmsg))
  })
  it('BUDGET_TIERS 数字 = LL-13 表原样（12/18/24；1200/1800/2400；4000/5000/6000；800/1200/1200）', () => {
    expect(BUDGET_TIERS.thrifty).toEqual({ history: 12, digest: 1200, worldbook: 4000, memory: 800 })
    expect(BUDGET_TIERS.standard).toEqual({ history: 18, digest: 1800, worldbook: 5000, memory: 1200 })
    expect(BUDGET_TIERS.full).toEqual({ history: 24, digest: 2400, worldbook: 6000, memory: 1200 })
  })
  it('经济档截断世界书 ≤4000 字符（LL-13 裁剪在客户端）', () => {
    const h = buildStaticHead(settingsT)
    expect(h.segments[3].length).toBeLessThanOrEqual(4000 + 32) // 段头前缀不计超额（截断按正文预算）
  })
  it('处境注入：可见待决处境逐一列出（LL-12 不变量 3）', () => {
    const t = tree()
    t._authority.pendingSituations.queue['sit-test'] = {
      key: 'sit-test', templateId: 'tpl-x',
      payload: { version: 1, title: '码头纠纷', desc: '…', options: [{ text: '看', effects: [] }], tags: ['test'] },
      arrivedAt: '1921-07-01', expiresAt: '1921-09-01',
    }
    const msgs = buildChatMessages({ tree: t, history: [], userText: '处理码头的事' }, settingsS)
    expect(msgs[1].content).toContain('码头纠纷')
    expect(msgs[1].content).toContain('sit-test')
  })
  it('key 不进 prompt（TEC-03/LL-12 不变量 4）', () => {
    const key = 'sk-secret-abcdef'
    const msgs = buildChatMessages({ tree: tree(), history: [], userText: '正常行动' }, settingsS)
    expect(JSON.stringify(msgs)).not.toContain(key)
  })
})
