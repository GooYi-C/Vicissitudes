// tests/unit/llm/prompt.test.ts — VS-01 prompt 装配（LL-12 段序/哈希稳定 / LL-13 档位 / key 免入）
import { describe, it, expect } from 'vitest'
import { buildChatMessages, buildStaticHead, BUDGET_TIERS } from '../../../src/llm/prompt'
import { runModelTurn } from '../../../src/llm/turnLoop'
import { parseBlocks } from '../../../src/parser/blocks'
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

// ── 结构块载荷契约（2026-09-22 实测补全的回归锁；见 docs/acceptance-vs01.md §4.1）──
// 病根：静态头只列标签名、不规定载荷 JSON 形态 → 真实模型块内写散文 → 逐块 bad-block、blocksApplied 0/12。
// 锁两条：① 契约文字对每个标签给全「键名 ＋ 可解析 JSON 对象」；② 该 JSON 形态对真管道真能全下链。
describe('VS-01 prompt：结构块载荷契约', () => {
  const head = () => buildStaticHead(settingsS).segments[0]

  it('契约文字声明五种标签（LL-01 开放范围；Intervene 不在本批次）', () => {
    const text = head()
    for (const tag of ['Command', 'JSONPatch', 'UpdateVariable', 'Resolve', 'Propose']) {
      expect(text).toContain(`&lt;${tag}&gt;`)
    }
    expect(text).not.toContain('Intervene')
  })

  // 关键不变量：静态头里**不得**出现 ASCII 的 <标签></标签> 字面量。
  // 否则 parseBlocks 会把示范块当真实结构块（从叙事中剥除、甚至被当真提交）。实测依据见 docs/acceptance-vs01.md §4.1。
  it('静态头不含任何 ASCII 结构块字面量（不得被 parseBlocks 当块剥除）', () => {
    const text = head()
    const parsed = parseBlocks(text)
    expect(parsed.blocks.length).toBe(0)
    expect(parsed.diagnostics.length).toBe(0)
    // 叙事＝原文逐行 trim 后去空行收拢（blocks.ts:80-84），逐字保留契约文字
    const normalized = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n')
    expect(parsed.narrative).toBe(normalized)
    expect(parsed.narrative).toContain('每个块的内容必须且只能是一个 JSON 对象')
  })

  it('契约文字给出每个标签的键名（缺一个键名 = 模型无从构造合法块）', () => {
    const text = head()
    for (const key of ['cmd', 'args', 'ops', 'op', 'path', 'value', 'key', 'optionIndex', 'title', 'desc', 'options', 'text', 'effects']) {
      expect(text).toContain(`"${key}"`)
    }
  })

  it('契约举例：每个标签都给出一段可解析的 JSON 对象（散文入标签＝bad-block 的根因）', () => {
    const text = head()
    // 扫描顶层 JSON 片段（括号深度法；不用反向引用正则——本仓 vitest 环境下反向引用实测不可靠）
    const spans: { start: number; end: number }[] = []
    let depth = 0
    let start = -1
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '{' || ch === '[') {
        if (depth === 0) start = i
        depth++
      } else if (ch === '}' || ch === ']') {
        depth--
        if (depth === 0 && start >= 0) {
          spans.push({ start, end: i + 1 })
          start = -1
        }
      }
    }
    /** 取该标签（示范只写开标签）之后的第一段「真载荷」顶层 JSON */
    const o = (tag: string): string | undefined => {
      const a = text.indexOf(`&lt;${tag}&gt;`)
      if (a < 0) return undefined
      for (const s of spans) {
        if (s.start <= a) continue
        const json = text.slice(s.start, s.end)
        // 语法行里的 {JSON} 形参占位不是载荷：真载荷必有键名
        if (!json.includes('"')) continue // 语法行里的 {JSON} 形参占位不是载荷：真载荷必有键名引号
        return json
      }
      return undefined
    }
    const withJson = ['Command', 'JSONPatch', 'UpdateVariable', 'Resolve', 'Propose'].filter((t) => o(t) !== undefined)
    expect(withJson).toEqual(['Command', 'JSONPatch', 'UpdateVariable', 'Resolve', 'Propose'])
    for (const tag of withJson) {
      const parsed = JSON.parse(o(tag) as string) as unknown
      expect(Array.isArray(parsed), `${tag} 载荷须为对象`).toBe(false)
      expect(typeof parsed === 'object' && parsed !== null, `${tag} 载荷须为对象`).toBe(true)
    }
    expect(text).toContain('"cmd"')
    expect(text).toContain('"ops"')
    expect(text).toContain('"optionIndex"') // Resolve 最易漏
    expect(text).toContain('"options"') // Propose 最易漏
  })

  it('契约里写死的示例块逐字进真管道：零 bad-block（示例本身不得是坏块）', () => {
    // Command 例的 args.to 是占位符（合法 JSON、非合法日期 → 编译期注记，非坏块），故此处只取另三例；
    // 日期占位是刻意的：静态头禁含日期（LL-12 不变量 5），具体日期由动态段 ⑥ 提供。
    const examples = `<JSONPatch>{"ops":[{"op":"replace","path":"/career/money","value":1}]}</JSONPatch>
<Resolve>{"key":"sit-dbg","optionIndex":0}</Resolve>
<Propose>{"title":"…","desc":"…","options":[{"text":"…","effects":[{"op":"modifyPlayer","args":{}}]}]}</Propose>`
    const r = runModelTurn(tree(), `夜深了。\n${examples}`)
    expect(r.metrics.blocksTotal).toBe(3)
    expect(r.metrics.blocksApplied).toBe(1) // 示例形状全部合格；另两块缺在档处境/options 数（rejected，非 bad-block）
    expect(r.diagnostics.some((d) => d.code === 'bad-block')).toBe(false)
    expect((r.state.career as unknown as { money?: number }).money).toBe(1) // JSONPatch 例真落账
  })

  it('未注入处境时 Resolve 是 rejected 而非坏块（示例形状无误，缺的只是在档 key）', () => {
    const r = runModelTurn(tree(), '<Resolve>{"key":"sit-不存在","optionIndex":0}</Resolve>')
    expect(r.metrics.blocksTotal).toBe(1)
    expect(r.metrics.blocksApplied).toBe(0)
    expect(r.diagnostics.some((d) => d.code === 'rejected')).toBe(true)
    expect(r.diagnostics.some((d) => d.code === 'bad-block')).toBe(false)
  })

  it('契约齐备的完整回合：五标签逐字照契约写 → 5/5 全下链（0/12 回归锁）', () => {
    const t = tree()
    t._authority.pendingSituations.queue['sit-dbg'] = {
      key: 'sit-dbg', templateId: 'tpl-dbg',
      payload: { version: 1, title: '码头纠纷', desc: '…', options: [{ text: '看', effects: [] }], tags: ['test'] },
      arrivedAt: '1921-07-01', expiresAt: '1921-09-01',
    }
    const r = runModelTurn(t, `闸北的秋雨下了三天，你在栈房里坐吃山空。
<JSONPatch>{"ops":[{"op":"replace","path":"/career/money","value":1}]}</JSONPatch>
<UpdateVariable>{"ops":[{"op":"add","path":"/memory/items/mv1","value":{"id":"mv1","type":"event","title":"…","content":"…","importance":5,"pinned":false,"archived":false,"people":[],"monthIndex":1,"createdAt":"1921-07-01","source":"model"}}]}</UpdateVariable>
<Resolve>{"key":"sit-dbg","optionIndex":0}</Resolve>
<Propose>{"title":"贩粮小生意","desc":"有人出低价粮，可试手气。","options":[{"text":"接下","effects":[{"op":"modifyPlayer","args":{"field":"money","value":-39}}]},{"text":"婉拒","effects":[]}]}</Propose>
<Command>{"cmd":"Travel","args":{"to":"1921-08"}}</Command>`)
    expect(r.metrics).toEqual({ blocksTotal: 5, blocksApplied: 5, proposeSeen: 1, proposeUsable: 1 })
    expect(r.narrative).toContain('闸北的秋雨') // 正文在块外 —— 叙事通道不再单点依赖块内内容
    expect(r.diagnostics.some((d) => d.code === 'bad-block')).toBe(false)
    expect((r.state.career as unknown as { money?: number }).money).toBe(1)
    expect(r.state.memory.items['mv1'].source).toBe('model')
    expect(r.state.world.date).toBe('1921-08')
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
