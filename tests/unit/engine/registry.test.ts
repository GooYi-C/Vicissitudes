import { describe, it, expect } from 'vitest'
import { simulationModules, aftermathModules, allModules } from '../../../src/engine/registry'
import { validateRegistry, RegistrationError } from '../../../src/orchestration/scheduler'
import { deriveRng } from '../../../src/engine/rng'
import { tickWorld, isTerminalMonth } from '../../../src/turn/monthRunner'
import { monthIndexFrom } from '../../../src/validation/calendar'
import { initialTree } from '../../../src/validation/tree'
import { sameWorld } from '../../../src/turn/TurnRunner'
import type { EngineModule } from '../../../src/engine/types'

describe('M-06/M-12 管线注册表', () => {
  it('simulation 11 个 + aftermath 5 个 = 16（M-12 不变量 2）', () => {
    expect(simulationModules()).toHaveLength(11)
    expect(aftermathModules()).toHaveLength(5)
    expect(allModules()).toHaveLength(16)
  })

  it('注册序与 M-12 表一致（simulation：temporal→…→intelligence）', () => {
    expect(simulationModules().map((m) => m.id)).toEqual([
      'temporal', 'history', 'market', 'trade', 'settlement', 'finance',
      'fiscal', 'worldtick', 'factions', 'labor', 'intelligence',
    ])
    expect(aftermathModules().map((m) => m.id)).toEqual([
      'goals', 'events', 'consistency', 'crisis', 'memory',
    ])
  })

  it('返回数组冻结（M-06 不变量 2：调用方不得就地排序）', () => {
    expect(Object.isFrozen(simulationModules())).toBe(true)
    expect(Object.isFrozen(aftermathModules())).toBe(true)
  })

  it('id 唯一且跨模块零重复', () => {
    const ids = allModules().map((m) => m.id)
    expect(new Set(ids).size).toBe(16)
  })

  it('phase/cadence/reads/writes 均为静态字面量（M-01 不变量 2）', () => {
    for (const m of allModules()) {
      expect(typeof m.id).toBe('string')
      expect(['simulation', 'aftermath']).toContain(m.phase)
      expect(['monthly', 'full']).toContain(m.cadence)
      expect(Array.isArray(m.reads)).toBe(true)
      expect(Array.isArray(m.writes)).toBe(true)
      expect(m.writes.length).toBeGreaterThan(0)
    }
  })

  it('cadence 分布：full 恰 4 个（labor/intelligence/consistency/crisis）', () => {
    const full = allModules().filter((m) => m.cadence === 'full').map((m) => m.id)
    expect(full.sort()).toEqual(['consistency', 'crisis', 'intelligence', 'labor'])
  })

  it('L2 文件数 = 模块数 + 4（types/registry/rng/adjacency 为层内基建，非模块位）', async () => {
    const { readdirSync } = await import('node:fs')
    const files = readdirSync('src/engine').filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    // 16 模块 + types + registry + rng + adjacency(M-11 库) = 20（adjacency 库不注册不参与管线，R3 登记）（L-05/M-07 的模块位口径见 SK-06 面板期快照）
    expect(files.length).toBe(20)
  })
})

describe('M-02 注册期四校验（mut 注入全灭）', () => {
  it('合法注册表零违例', () => {
    expect(() => validateRegistry(simulationModules(), aftermathModules())).not.toThrow()
  })

  it('校验 1（mut）：writes 为空 → 报错', () => {
    const evil: EngineModule = {
      id: 'evil', phase: 'simulation', cadence: 'monthly',
      reads: [], writes: [],
      collect: () => [],
    }
    expect(() => validateRegistry([evil], [])).toThrow(RegistrationError)
  })

  it('校验 2（mut）：同域双写者未登记链 → 报错（ARC-3）', () => {
    const a: EngineModule = {
      id: 'writer-a', phase: 'simulation', cadence: 'monthly',
      reads: [], writes: ['crisis/*'],
      collect: () => [],
    }
    const b: EngineModule = {
      id: 'writer-b', phase: 'simulation', cadence: 'monthly',
      reads: [], writes: ['crisis/*'],
      collect: () => [],
    }
    expect(() => validateRegistry([a, b], [])).toThrow(/域 crisis 有 2 个写者/)
  })

  it('校验 2 放行：链①登记域（territoryControl 双写者合法）', () => {
    const a: EngineModule = {
      id: 'history', phase: 'simulation', cadence: 'monthly',
      reads: [], writes: ['_authority.territoryControl'],
      collect: () => [],
    }
    const b: EngineModule = {
      id: 'factions', phase: 'simulation', cadence: 'monthly',
      reads: [], writes: ['_authority.territoryControl'],
      collect: () => [],
    }
    expect(() => validateRegistry([a, b], [])).not.toThrow()
  })

  it('校验 3（mut）：读序违规（前位读后位写域）→ 报错', () => {
    const early: EngineModule = {
      id: 'early', phase: 'simulation', cadence: 'monthly',
      reads: ['trade/*'], writes: ['settlement/*'],
      collect: () => [],
    }
    const late: EngineModule = {
      id: 'late', phase: 'simulation', cadence: 'monthly',
      reads: [], writes: ['trade/*'],
      collect: () => [],
    }
    expect(() => validateRegistry([early, late], [])).toThrow(/读序/)
  })

  it('校验 3 放行：读自己的写域 / 读前位写域', () => {
    const first: EngineModule = {
      id: 'first', phase: 'simulation', cadence: 'monthly',
      reads: ['settlement/*'], writes: ['settlement/*'],
      collect: () => [],
    }
    const second: EngineModule = {
      id: 'second', phase: 'simulation', cadence: 'monthly',
      reads: ['settlement/*'], writes: ['finance/*'],
      collect: () => [],
    }
    expect(() => validateRegistry([first, second], [])).not.toThrow()
  })

  it('校验 4（mut）：market 相位唯一发布 —— early 读 market 域且排在 market 前 → 读序违规', () => {
    // 构造：temporal 读 economy.commodities（market 写域）而 temporal 排在 market 前
    const t: EngineModule = {
      id: 'temporal', phase: 'simulation', cadence: 'monthly',
      reads: ['economy.commodities'], writes: ['world.date'],
      collect: () => [],
    }
    const m: EngineModule = {
      id: 'market', phase: 'simulation', cadence: 'monthly',
      reads: [], writes: ['economy.commodities'],
      collect: () => [],
    }
    expect(() => validateRegistry([t, m], [])).toThrow(/读序/)
  })
})

describe('B-02 rng 派生契约（ARC-6）', () => {
  it('同 (模块, monthIndex, salt) → 序列逐位一致', () => {
    const a = deriveRng('events', 42, 'events')
    const b = deriveRng('events', 42, 'events')
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next())
  })

  it('任一参数变 → 序列不同（模块隔离 / 月序参与 / salt 语义）', () => {
    const first = (moduleId: string, monthIndex: number, salt: string) => deriveRng(moduleId, monthIndex, salt).next()
    const base = first('events', 42, 'events')
    expect(base).not.toBe(first('market', 42, 'events')) // 模块隔离
    expect(base).not.toBe(first('events', 43, 'events')) // 月序参与
    expect(base).not.toBe(first('events', 42, 'other')) // salt 语义
  })

  it('int/pick 边界与分布形态', () => {
    const r = deriveRng('test', 0, 's')
    expect(r.int(1)).toBe(0)
    expect(() => r.int(0)).toThrow()
    expect(() => r.pick([])).toThrow()
    const xs = ['a', 'b', 'c'] as const
    expect(xs).toContain(r.pick(xs))
  })
})

describe('B-05 双管线调度 + 提交权（tickWorld）', () => {
  it('调月推进：temporal 产出 advanceDate，经 TurnRunner 提交，canonical 日期前进一步', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const r = tickWorld(tree)
    expect(r.ok).toBe(true)
    expect(r.state.world.date).toBe('1921-08')
    expect(r.writtenDomains).toContain('world.date')
  })

  it('调用矩阵：每模块恰好一次（MOD-5）—— 非终月 monthly 跑、full 不跑', () => {
    const tree = initialTree('era-warlord', '1921-07') // 非终月
    const r = tickWorld(tree)
    const called = new Set(r.callLog)
    // monthly 模块全跑（simulation 9 monthly + aftermath 3 monthly = 12）
    for (const id of ['temporal', 'history', 'market', 'trade', 'settlement', 'finance', 'fiscal', 'worldtick', 'factions', 'goals', 'events', 'memory']) {
      expect(called.has(`simulation:${id}`) || called.has(`aftermath:${id}`), id).toBe(true)
    }
    // full 模块不跑（非终月）
    for (const id of ['labor', 'intelligence', 'consistency', 'crisis']) {
      expect(called.has(`simulation:${id}`) || called.has(`aftermath:${id}`), id).toBe(false)
    }
    // 恰一次：无重复
    expect(r.callLog.length).toBe(new Set(r.callLog).size)
  })

  it('终月（12 月）：full 模块也跑（两条管线跑满）', () => {
    const tree = initialTree('era-warlord', '1928-12')
    const r = tickWorld(tree)
    const called = new Set(r.callLog)
    for (const id of ['labor', 'intelligence', 'consistency', 'crisis']) {
      expect(called.has(`simulation:${id}`) || called.has(`aftermath:${id}`), id).toBe(true)
    }
  })

  it('相位次序：simulation 全部先于 aftermath（B-05 不变量 1，不交错）', () => {
    const tree = initialTree('era-warlord', '1928-12')
    const r = tickWorld(tree)
    const firstAftermath = r.callLog.findIndex((c) => c.startsWith('aftermath:'))
    const lastSimulation = r.callLog.map((c) => c.startsWith('aftermath:')).lastIndexOf(false)
    expect(firstAftermath).toBeGreaterThan(lastSimulation)
  })

  it('同输入两次推演逐位一致（ARC-5 的月级体现）', () => {
    const t1 = initialTree('era-warlord', '1921-07')
    const t2 = initialTree('era-warlord', '1921-07')
    const r1 = tickWorld(t1)
    const r2 = tickWorld(t2)
    expect(r1.ok && r2.ok).toBe(true)
    expect(sameWorld(r1.state, r2.state)).toBe(true)
    expect(r1.callLog).toEqual(r2.callLog)
  })

  it('连续推 12 月：日期逐月推进，无跳月无回退', () => {
    let tree = initialTree('era-warlord', '1921-07')
    for (let i = 0; i < 12; i++) {
      const r = tickWorld(tree)
      expect(r.ok).toBe(true)
      tree = r.state
    }
    expect(tree.world.date).toBe('1922-07')
  })

  it('isTerminalMonth：12 月为终月（年关账口径初值）', () => {
    expect(isTerminalMonth('1928-12')).toBe(true)
    expect(isTerminalMonth('1928-11')).toBe(false)
    expect(monthIndexFrom('1928-12')).toBe(95)
  })
})

describe('temporal 模块行为（月推进 + 货币锚点）', () => {
  it('货币锚点切换：1939-01 起法币（monthIndex 217）', () => {
    const tree = initialTree('era-warlord', '1938-12')
    const r = tickWorld(tree) // → 1939-01
    expect(r.state.world.date).toBe('1939-01')
    expect(r.state.economy.currency).toBe('fabi')
    expect(r.writtenDomains).toContain('economy.currency')
  })

  it('银元期内货币不变（锚点稳定段零切换效果）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const r = tickWorld(tree)
    expect(r.state.economy.currency).toBe('yinyuan')
    expect(r.writtenDomains).not.toContain('economy.currency')
  })
})

describe('TurnRunner 与调度器集成（提交权唯一）', () => {
  it('tickWorld 内部 TurnRunner 单次提交（16 模块效果一批落账）', () => {
    const tree = initialTree('era-warlord', '1938-12')
    const r = tickWorld(tree)
    // 12 月终月：全部 16 模块都跑了，但提交仍是一批（advanceDate + setCurrency 同批）
    expect(r.ok).toBe(true)
    expect(r.state.world.date).toBe('1939-01')
    expect(r.state.economy.currency).toBe('fabi')
  })

  it('空效果月：状态逐位不变（幂等 —— 调用矩阵承担）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    // 先推进一次（temporal 产出）；再对已含日期的树重复推（另一月）
    const r1 = tickWorld(tree)
    const r2 = tickWorld(r1.state)
    expect(r2.ok).toBe(true)
    expect(r2.state.world.date).toBe('1921-09')
  })
})
