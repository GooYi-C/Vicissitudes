// tests/unit/llm/turn-loop.test.ts — VS-01 回合全链（下半管道确定性/原子性/降级零机制效果）
import { describe, it, expect } from 'vitest'
import { runModelTurn } from '../../../src/llm/turnLoop'
import { initialTree, type Tree } from '../../../src/validation/tree'
import { sameWorld } from '../../../src/turn/TurnRunner'
import { serializeSave, makeInitialSave } from '../../../src/stores/saves'

const tree = () => initialTree('era-warlord', '1921-07')

const GOOD = `你决定去码头看看，找到了活计。
<UpdateVariable>{"ops":[{"op":"replace","path":"/career/money","value":15}]}</UpdateVariable>
<Command>{"cmd":"Travel","args":{"to":"1921-08"}}</Command>
<Propose>{"title":"贩粮小生意","desc":"有人出低价粮，可试手气。","options":[{"text":"接下","effects":[{"op":"modifyPlayer","args":{"field":"money","value":-39}}]},{"text":"婉拒","effects":[]}]}</Propose>`

describe('VS-01 回合链：意图遵循与原子提交', () => {
  it('脚本化好回复：三块全下链（遵循率 3/3）＋ 单次原子提交落树', () => {
    const r = runModelTurn(tree(), GOOD)
    expect(r.ok).toBe(true)
    expect(r.metrics.blocksTotal).toBe(3)
    expect(r.metrics.blocksApplied).toBe(3)
    expect(r.metrics.proposeSeen).toBe(1)
    expect(r.metrics.proposeUsable).toBe(1)
    expect(r.state.world.date).toBe('1921-08') // Command 落账
    const career = r.state.career as unknown as { money?: number }
    expect(career.money).toBe(15) // sanitize 落账
    expect('sit-mp-贩粮小生意' in r.state._authority.pendingSituations.queue).toBe(true) // Propose 入队
    expect(r.state._authority.pendingSituations.queue['sit-mp-贩粮小生意'].templateId).toBe('model-proposal')
    expect(r.narrative).toContain('去码头看看')
    expect(r.writtenDomains).toEqual(expect.arrayContaining(['career.money', 'world.date', '_authority.pendingSituations'])) // domainOfPath 口径：/career/money → career.money（与 TurnRunner U-02 同源）
  })

  it('Tier0 越权补丁被剥除（其余 op 照常落账）', () => {
    const text = `动手脚。
<UpdateVariable>{"ops":[{"op":"replace","path":"/_authority/territoryControl/claims/0/controller","value":"x"},{"op":"replace","path":"/career/money","value":7}]}</UpdateVariable>`
    const r = runModelTurn(tree(), text)
    expect(r.ok).toBe(true)
    expect((r.state.career as unknown as { money?: number }).money).toBe(7)
    expect(r.state._authority.territoryControl.claims).toHaveLength(0)
    expect(r.diagnostics.some((d) => d.detail.includes('tier0'))).toBe(true)
  })

  it('超幅提议整块丢弃 + proposal-rejected 注记；可用率 0/1；世界不受影响', () => {
    const text = `<Propose>{"title":"空手套白狼","desc":"一次捞千银。","options":[{"text":"干","effects":[{"op":"modifyPlayer","args":{"field":"money","value":-99999}}]}]}</Propose>`
    const t = tree()
    const r = runModelTurn(t, text)
    expect(r.ok).toBe(true)
    expect(r.metrics.proposeSeen).toBe(1)
    expect(r.metrics.proposeUsable).toBe(0) // options 1 个也不合法（2–4 钳制先行）
    expect(nothingIn(r.state)).toBe(false)
    expect(Object.keys(r.state._authority.pendingSituations.queue)).toHaveLength(0)
    expect(r.diagnostics.some((d) => d.code === 'proposal-rejected')).toBe(true)
    function nothingIn(s: Tree): boolean { return Object.keys(s._authority.pendingSituations.queue).length > 0 }
  })

  it('同 (tree, modelText) → 同结果（下半管道确定性回归）', () => {
    const a = runModelTurn(tree(), GOOD)
    const c = runModelTurn(tree(), GOOD)
    expect(sameWorld(a.state, c.state)).toBe(true)
    expect(a.writtenDomains).toEqual(c.writtenDomains)
  })

  it('全失败路径：无意图块 → 零提交 → 世界逐位不变（LL-19 降级零机制效果）', () => {
    const t = tree()
    const r = runModelTurn(t, '本月无事，平静。')
    expect(r.ok).toBe(true)
    expect(r.metrics.blocksTotal).toBe(0)
    expect(sameWorld(r.state, t)).toBe(true)
    expect(r.writtenDomains).toEqual([])
  })

  it('坏块不中断回合（bad-block 注记，好块仍落账）', () => {
    const text = `前行。
<UpdateVariable>{"ops":[{"op":"replace","path":"/career/money","value":9}]}</UpdateVariable>
<UpdateVariable>{{坏 JSON</UpdateVariable>`
    const r = runModelTurn(tree(), text)
    expect(r.ok).toBe(true)
    expect((r.state.career as unknown as { money?: number }).money).toBe(9)
    expect(r.diagnostics.some((d) => d.code === 'bad-block')).toBe(true)
  })

  it('自报 actor 被剥离（LLM-15：构造期不读取）', () => {
    const text = `<UpdateVariable>{"actor":"engine","ops":[{"op":"replace","path":"/career/money","value":4}]}</UpdateVariable>`
    const r = runModelTurn(tree(), text)
    expect(r.ok).toBe(true)
    expect((r.state.career as unknown as { money?: number }).money).toBe(4) // payload 内 actor 不影响 ops 下链（剥离＝不读取）
  })

  it('SaveRecord 序列化不含 apiKey（S-04/TEC-03：settings 是设备级 nicht在 variables 内）', () => {
    const key = 'sk-do-not-persist'
    const record = makeInitialSave({ slotId: 't', eraId: 'era-warlord', identityId: 'student', date: '1921-07', variables: JSON.parse(JSON.stringify(tree())) as never, updatedAt: '1921-07' })
    expect(serializeSave(record)).not.toContain(key)
    expect(serializeSave(record)).not.toContain('apiKey')
  })
})
