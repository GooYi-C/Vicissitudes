import { describe, it, expect } from 'vitest'
import { parseBlocks } from '../../../src/parser/blocks'
import { authorize, narratorCapability, stripSelfReportedActor } from '../../../src/parser/authorize'
import { sanitize, buildDomainWhitelist, whitelistProjection } from '../../../src/parser/sanitize'
import { compile, compileCommand } from '../../../src/turn/compiler'
import { TurnRunner, applyPatch, sameWorld, domainOfPath } from '../../../src/turn/TurnRunner'
import { initialTree } from '../../../src/validation/tree'

const tree = initialTree('era-warlord', '1921-07')

describe('LL-02 结构块解析', () => {
  it('叙事 + 多结构块：剥离干净、块序稳定、payload __proto__ 防护', () => {
    const raw = `清晨的雾还没散。
<Command>{"cmd":"Travel","args":{"to":"1921-08"}}</Command>
你上了船。
<UpdateVariable>{"ops":[]}</UpdateVariable>
到岸时天已黑。`
    const r = parseBlocks(raw)
    expect(r.narrative).toBe('清晨的雾还没散。\n你上了船。\n到岸时天已黑。')
    expect(r.blocks).toHaveLength(2)
    expect(r.blocks[0].tag).toBe('Command')
    expect(r.blocks[0].at).toBeLessThan(r.blocks[1].at)
    expect(r.diagnostics).toEqual([])
  })

  it('坏 JSON → 丢该块 + bad-block 注记，其余照常（LLM-14）', () => {
    const raw = `正文。
<Command>{bad json}</Command>
<Command>{"cmd":"Travel","args":{"to":"1921-08"}}</Command>`
    const r = parseBlocks(raw)
    expect(r.blocks).toHaveLength(1)
    expect(r.diagnostics).toHaveLength(1)
    expect(r.diagnostics[0].code).toBe('bad-block')
  })

  it('未知标签留在叙事里（不视为错误）', () => {
    const raw = `正文。<Foo>{"x":1}</Foo>尾。`
    const r = parseBlocks(raw)
    expect(r.blocks).toHaveLength(0)
    expect(r.diagnostics).toHaveLength(0)
    expect(r.narrative).toContain('<Foo>')
  })

  it('__proto__ 载荷键被剥除（DAT-22 同源）', () => {
    const raw = `<Command>{"cmd":"Travel","__proto__":{"evil":1},"args":{"to":"1921-08"}}</Command>`
    const r = parseBlocks(raw)
    expect(Object.keys(r.blocks[0].payload as object).sort()).toEqual(['args', 'cmd'])
  })

  it('同文本 → 同 ParseResult（确定性）', () => {
    const raw = `<Command>{"cmd":"Travel","args":{"to":"1921-08"}}</Command>x`
    expect(JSON.stringify(parseBlocks(raw))).toBe(JSON.stringify(parseBlocks(raw)))
  })
})

describe('LL-03 capability 授权', () => {
  const cap = narratorCapability()

  it('开放集合命令放行（Travel/Business/Trade/Railway/Scout/Fiscal）', () => {
    for (const cmd of ['Travel', 'Business', 'Trade', 'Railway', 'Scout', 'Fiscal']) {
      const r = authorize({ tag: 'Command', raw: '', payload: { cmd }, at: 0 }, cap)
      expect(r.ok, cmd).toBe(true)
    }
  })

  it('系统流程命令（startGame/startPrologue）模型不可触发', () => {
    const r = authorize({ tag: 'Command', raw: '', payload: { cmd: 'startGame' }, at: 0 }, cap)
    expect(r.ok).toBe(false)
  })

  it('Occupation 走提议门 —— 无确认零执行（LL-09/LLM-5）', () => {
    const r = authorize({ tag: 'Command', raw: '', payload: { cmd: 'Occupation' }, at: 0 }, cap)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toContain('提议门')
  })

  it('未列举命令（Pointer/City）关闭', () => {
    for (const cmd of ['Pointer', 'City', 'Hack']) {
      const r = authorize({ tag: 'Command', raw: '', payload: { cmd }, at: 0 }, cap)
      expect(r.ok, cmd).toBe(false)
    }
  })

  it('自报 actor 被剥离（LLM-15 行为侧）', () => {
    const stripped = stripSelfReportedActor({ cmd: 'Travel', actor: 'engine' })
    expect(stripped).toEqual({ cmd: 'Travel' })
    expect('actor' in stripped).toBe(false)
  })

  it('engine/debug 无下发路径：narratorCapability 返回的字面量只能是 narrator（LLM-19 结构侧）', () => {
    expect(narratorCapability().actor).toBe('narrator')
    expect(cap.commandSet).not.toContain('startGame')
  })
})

describe('LL-04 sanitize 白名单（M-03 投影）', () => {
  const wl = buildDomainWhitelist()

  it('白名单 = 主角级域 + memory.items（authority 与引擎独占域全扣除）', () => {
    expect(whitelistProjection()).toEqual(['career', 'memory.items', 'player'])
  })

  it('Tier 0 拦截先于幅度：authority set 一律剥除（LLM-17）', () => {
    const r = sanitize(
      [
        { op: 'replace', path: '/_authority/territoryControl/claims/0/controller', value: 'zhili' },
        { op: 'replace', path: '/career/money', value: 10 },
      ],
      wl,
    )
    expect(r.accepted).toHaveLength(1)
    expect(r.rejected[0].reason).toBe('tier0')
  })

  it('行情表 / forces / war 等引擎独占域剥除并注记', () => {
    const r = sanitize(
      [
        { op: 'replace', path: '/economy/commodities/rice/price', value: 1 },
        { op: 'add', path: '/forces/warlordA/soldiers', value: 999 },
        { op: 'add', path: '/war/siegeWarnings/x', value: {} },
      ],
      wl,
    )
    expect(r.accepted).toHaveLength(0)
    expect(r.rejected).toHaveLength(3)
  })

  it('memory.items 单轮 +3：第 4 条起剥除（MEM-4）', () => {
    const ops = [1, 2, 3, 4, 5].map((i) => ({ op: 'add' as const, path: `/memory/items/m${i}`, value: { id: `m${i}` } }))
    const r = sanitize(ops, wl)
    expect(r.accepted).toHaveLength(3)
    expect(r.rejected).toHaveLength(2)
    expect(r.rejected[0].reason).toBe('memory-quota')
  })

  it('表外域（map/timeline/goals）剥除 —— 不在白名单', () => {
    const r = sanitize([{ op: 'replace', path: '/map/shanghai/security', value: 50 }], wl)
    expect(r.accepted).toHaveLength(0)
    expect(r.rejected[0].reason).toBe('tier0') // map 是引擎独占 → tier0 语义
  })

  it('剥除逐 op，序保持不重排', () => {
    const r = sanitize(
      [
        { op: 'replace', path: '/career/money', value: 1 },
        { op: 'replace', path: '/economy/currency', value: 'fake' },
        { op: 'replace', path: '/career/health', value: 90 },
      ],
      wl,
    )
    expect(r.accepted.map((o) => o.path)).toEqual(['/career/money', '/career/health'])
  })
})

describe('B-07 编译器（受限指令集 → RFC 6902）', () => {
  it('cityEffect → map/<city>/<dim>（效果不携带路径知识，编译层映射）', () => {
    const ops = compile([{ op: 'cityEffect', args: { cityId: 'shanghai', dim: 'security', delta: -5, base: 60 } }], tree)
    expect(ops).toEqual([{ op: 'replace', path: '/map/shanghai/security', value: 55 }])
  })

  it('六维越界钳制 [0,100]', () => {
    const ops = compile([{ op: 'cityEffect', args: { cityId: 'shanghai', dim: 'security', delta: 50, base: 60 } }], tree)
    expect(ops[0]).toEqual({ op: 'replace', path: '/map/shanghai/security', value: 100 })
  })

  it('未知 op 抛错（不静默跳过）', () => {
    expect(() => compile([{ op: 'nonsense' as never, args: {} }], tree)).toThrow(/受限指令集封闭/)
  })

  it('未知维度抛错（六维封闭枚举）', () => {
    expect(() => compile([{ op: 'cityEffect', args: { cityId: 'x', dim: 'magic', delta: 1, base: 0 } }], tree)).toThrow(/六维/)
  })

  it('编译纯函数：同输入同 ops（BUS-4/LL-08）', () => {
    const effs = [{ op: 'advanceDate' as const, args: { to: '1921-08' } }]
    expect(compile(effs, tree)).toEqual(compile(effs, tree))
  })

  it('compileCommand 签名无来源参数 —— 命令与意图等价（LLM-20 结构侧）', () => {
    const fromUi = compileCommand({ cmd: 'Travel', args: { to: '1921-08' } }, tree)
    const fromLlm = compileCommand({ cmd: 'Travel', args: { to: '1921-08' } }, tree)
    expect(fromUi).toEqual(fromLlm)
  })
})

describe('B-06 TurnRunner 原子提交', () => {
  it('合法批 → 提交成功 + 实际写入域通知（不是全都 bump）', () => {
    const runner = new TurnRunner()
    const bumped: string[][] = []
    runner.onCommit((ds) => bumped.push([...ds]))
    const r = runner.commit([{ op: 'advanceDate', args: { to: '1921-08' } }], tree)
    expect(r.ok).toBe(true)
    expect(r.state.world.date).toBe('1921-08')
    expect(r.writtenDomains).toEqual(['world.date'])
    expect(bumped).toEqual([['world.date']])
  })

  it('批内任一 op 非法 → 整批丢弃，世界零变更（BUS-3）', () => {
    const runner = new TurnRunner()
    const r = runner.commit(
      [
        { op: 'advanceDate', args: { to: '1921-08' } },
        { op: 'cityEffect', args: { cityId: 'x', dim: 'not-a-dim', delta: 1, base: 0 } },
      ],
      tree,
    )
    expect(r.ok).toBe(false)
    expect(r.state.world.date).toBe('1921-07') // 原树不动
    expect(r.writtenDomains).toEqual([])
  })

  it('失败批不 bump（BUS-6：UI 不重算旧数据）', () => {
    const runner = new TurnRunner()
    let bumps = 0
    runner.onCommit(() => bumps++)
    runner.commit([{ op: 'cityEffect', args: { cityId: 'x', dim: 'bad', delta: 1, base: 0 } }], tree)
    expect(bumps).toBe(0)
  })

  it('一次回合只允许一次提交（B-06 不变量 3）', () => {
    const runner = new TurnRunner()
    expect(runner.commit([{ op: 'advanceDate', args: { to: '1921-08' } }], tree).ok).toBe(true)
    const second = runner.commit([{ op: 'advanceDate', args: { to: '1921-09' } }], tree)
    expect(second.ok).toBe(false)
    expect(second.state.world.date).toBe('1921-08') // 第二次被拒，状态保持第一次提交后
  })

  it('同输入两次运行逐位一致（SK-04 出口判据；ARC-5 前提）', () => {
    const effs = [{ op: 'advanceDate', args: { to: '1921-08' } }, { op: 'setCurrency', args: { currency: 'fabi' } }] as const
    const r1 = new TurnRunner().commit(effs, tree)
    const r2 = new TurnRunner().commit(effs, tree)
    expect(r1.ok && r2.ok).toBe(true)
    expect(sameWorld(r1.state, r2.state)).toBe(true)
  })

  it('applyPatch 不改原树（纯函数；回滚 = 丢弃 draft）', () => {
    const ops = [{ op: 'replace' as const, path: '/world/date', value: '1921-08' }]
    const snapshot = JSON.stringify(tree)
    applyPatch(tree, ops)
    expect(JSON.stringify(tree)).toBe(snapshot)
  })

  it('domainOfPath：authority 按子域、其余按首两段', () => {
    expect(domainOfPath('/_authority/territoryControl/claims/-')).toBe('_authority.territoryControl')
    expect(domainOfPath('/career/money')).toBe('career.money')
    expect(domainOfPath('/world/date')).toBe('world.date')
  })
})

describe('SK-04 管线全链（脚本化回复跑通完整回合）', () => {
  it('模型回复 → 解析 → 授权 → sanitize → 编译 → 原子提交', () => {
    // 脚本化回复（免 API；§3.3 门 4 前半）
    const reply = `你决定北上。码头汽笛长鸣。
<Command>{"cmd":"Travel","args":{"to":"1921-08"}}</Command>
<UpdateVariable>{"ops":[{"op":"replace","path":"/career/money","value":3}]}</UpdateVariable>
<UpdateVariable>{"ops":[{"op":"replace","path":"/_authority/territoryControl/claims/0/controller","value":"zhili"}]}</UpdateVariable>`

    // ① 解析
    const parsed = parseBlocks(reply)
    expect(parsed.blocks).toHaveLength(3)

    // ② 授权（Command 走 capability；UpdateVariable 直通 sanitize）
    const cap = narratorCapability()
    const authorized = parsed.blocks.map((b) => authorize(b, cap))
    expect(authorized.map((a) => a.ok)).toEqual([true, true, true])

    // ③ sanitize（UpdateVariable 的 ops 白名单投影）
    const wl = buildDomainWhitelist()
    const patchOps = authorized
      .filter((a) => a.ok && (a.block.tag === 'UpdateVariable' || a.block.tag === 'JSONPatch'))
      .flatMap((a) => ((a.ok ? a.block.payload : {}) as { ops: { op: string; path: string; value?: unknown }[] }).ops)
    const sanitized = sanitize(patchOps as never, wl)
    expect(sanitized.accepted.map((o) => o.path)).toEqual(['/career/money'])
    expect(sanitized.rejected[0].reason).toBe('tier0')

    // ④ 编译（Command 块 → DomainEffect；sanitize 后的 patch 直为 ops）
    const travelBlock = parsed.blocks.find((b) => b.tag === 'Command')!
    const cmdEffects = compileCommand(
      { cmd: (travelBlock.payload as { cmd: string }).cmd, args: (travelBlock.payload as { args: Record<string, unknown> }).args },
      tree,
    )
    const ops = compile(cmdEffects, tree)
    expect(ops).toEqual([{ op: 'replace', path: '/world/date', value: '1921-08' }])

    // ⑤ 原子提交（合法 op 全批；Tier0 已在 sanitize 剥除，不进提交）
    const runner = new TurnRunner()
    const result = runner.commit(cmdEffects, tree)
    expect(result.ok).toBe(true)
    expect(result.state.world.date).toBe('1921-08')

    // 落档（writeSave 在 SK-06 面板期接 UI；此处验证序列化确定性）
    expect(sameWorld(result.state, new TurnRunner().commit(cmdEffects, tree).state)).toBe(true)
  })

  it('LLM 失败路径世界零变更（LL-19：降级不产生机制效果）', () => {
    // 全失败 = 无意图块 → 只有叙事 → 零 effects → 零提交
    const parsed = parseBlocks('本月平静。')
    expect(parsed.blocks).toHaveLength(0)
    const runner = new TurnRunner()
    const r = runner.commit([], tree) // 空批：合法（零变更提交）
    expect(r.ok).toBe(true)
    expect(sameWorld(r.state, tree)).toBe(true)
  })
})
