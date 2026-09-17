// tests/unit/engine/r3-commands.spec.ts — R3-3/R3-4 邻接库 + Occupation/Scout 命令
import { describe, it, expect } from 'vitest'
import { buildAdjacency } from '../../../src/engine/adjacency'
import { occupationCommand, MIN_FORCES, OCCUPATION_ADVANTAGE } from '../../../src/gameCommands/occupation'
import { scoutCommand, INTEL_EXPIRY_MONTHS } from '../../../src/gameCommands/scout'
import { initialTree, type Tree } from '../../../src/validation/tree'
import { cities } from '../../../src/data/cities'

describe('R3-4 adjacency 库（M-11）', () => {
  it('图连通性：全城可达（BFS 无孤岛 —— DAT-09 同源）', () => {
    const adj = buildAdjacency()
    for (const a of cities) {
      for (const b of cities) {
        if (a.id === b.id) continue
        expect(adj.hopDistance(a.id, b.id), `${a.id}→${b.id}`).toBeLessThan(Infinity)
      }
    }
  })

  it('邻接对称 & 跳数正确：京津 1 跳 / 沪蓉多跳', () => {
    const adj = buildAdjacency()
    expect(adj.hopDistance('beijing', 'tianjin')).toBe(1)
    expect(adj.hopDistance('tianjin', 'beijing')).toBe(1) // 对称
    expect(adj.hopDistance('shanghai', 'shanghai')).toBe(0)
    expect(adj.hopDistance('shanghai', 'chengdu')).toBeGreaterThan(1) // 沪→蓉经武汉
  })

  it('exit 线路不计邻接：沪→港走 exit 不进邻接集', () => {
    const adj = buildAdjacency()
    expect(adj.neighbors.get('shanghai')?.has('hongkong')).toBe(false) // line-exit-sh 不计
    expect(adj.neighbors.get('shanghai')?.has('hangzhou')).toBe(true) // 普通线照计
  })
})

describe('R3-3 OccupationCommand（E-3.3 全公式）', () => {
  function treeWithIntel(cityId: string, level = 2): Tree {
    const base = initialTree('era-warlord', '1921-07')
    return {
      ...base,
      _authority: {
        ...base._authority,
        intelligenceObservations: {
          observations: [{ id: `scout-${cityId}-0`, regionId: cityId, level, observedAt: '1921-07-01', expiresAt: '1921-10-01' }],
        },
        territoryControl: {
          claims: [
            { polityId: 'vic.hubei', controller: 'player', interval: { from: '1921-01-01', to: '1950-01-01' } }, // 玩家控制武汉
          ],
        },
      },
    }
  }

  it('兵力门槛：民团（<100）攻省城 → 拒绝（E-2.3 台阶断言）', () => {
    const tree = treeWithIntel('wuhan')
    const r = occupationCommand({ cityId: 'hangzhou', playerForces: 50 }, tree)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no-forces')
  })

  it('邻接前置：无控制城接触 → 拒绝', () => {
    const tree = treeWithIntel('harbin')
    const r = occupationCommand({ cityId: 'harbin', playerForces: 500 }, tree) // 玩家控制区在湖北
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no-adjacency')
  })

  it('情报前置：目标城 <2 级 → 拒绝（盲攻不可行）', () => {
    const tree = treeWithIntel('chengdu', 1) // 成都 1 级情报（玩家控武汉 —— 成都与武汉 1 跳邻接，前置到情报门）
    const r = occupationCommand({ cityId: 'chengdu', playerForces: 500 }, tree)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no-intel')
  })

  it('胜负判定：兵力 ≥ 守军 × 1.2 → 攻坚可行 + claim 落账（链①通道）', () => {
    const tree = treeWithIntel('chengdu')
    // 玩家控制武汉（湖北）→ 邻接城：成都/广州（vic.hubei 邻接 wuhan 的城）；成都情报 2 级 ✓
    const r = occupationCommand({ cityId: 'chengdu', playerForces: 400 }, tree)
    // 成都 vic.sichuan 无主（民团基线 150）→ 400 ≥ 150×1.2 ✓；邻接：wuhan→chengdu 1 跳 ✓；成都情报 2 级 ✓
    expect(r.ok, r.ok ? '' : r.message).toBe(true)
    if (!r.ok) return
    expect(r.effects).toHaveLength(1)
    expect(r.effects[0].op).toBe('claimTerritory')
    expect(r.effects[0].args.controller).toBe('player') // 链①第三写者
    expect(r.casualties).toBeGreaterThan(0) // 伤亡 = 守军 × 0.15–0.3
    expect(r.days).toBeGreaterThanOrEqual(7) // 天数 = 7 + 守军/50
  })

  it('优势比不足 → 拒绝（lost）', () => {
    const tree = treeWithIntel('chengdu') // 成都邻接且情报 2 级 —— 前置全过，卡在胜负门
    const r = occupationCommand({ cityId: 'chengdu', playerForces: 120 }, tree) // 120 < 150×1.2=180
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('lost')
    expect(OCCUPATION_ADVANTAGE).toBe(1.2) // E-3.3 旧公式继承
    expect(M_FORCES()).toBe(100)
  })

  function M_FORCES() { return MIN_FORCES }
})

describe('R3-3 ScoutCommand（情报迷雾）', () => {
  it('邻城侦察：2 级观察写入 + 3 月时效', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const r = scoutCommand({ cityId: 'hangzhou', fromCityId: 'shanghai' }, tree)
    expect(r.ok, r.ok ? '' : r.message).toBe(true)
    if (!r.ok) return
    expect(r.level).toBe(2)
    expect(INTEL_EXPIRY_MONTHS).toBe(3)
    const obs = r.effects[0].args.observations as { regionId: string; expiresAt: string }[]
    expect(obs.some((o) => o.regionId === 'hangzhou' && o.expiresAt === '1921-10-01')).toBe(true)
  })

  it('同城侦察合法（摸自己脚下的情报）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const r = scoutCommand({ cityId: 'shanghai', fromCityId: 'shanghai' }, tree)
    expect(r.ok).toBe(true)
  })

  it('远城侦察 → 拒绝（半径 1 跳）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    const r = scoutCommand({ cityId: 'chengdu', fromCityId: 'shanghai' }, tree) // 沪→蓉 2 跳
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('too-far')
  })

  it('过期旧观察被清理（去旧保未过期）', () => {
    const base = initialTree('era-warlord', '1921-07')
    const tree: Tree = {
      ...base,
      _authority: {
        ...base._authority,
        intelligenceObservations: {
          observations: [
            { id: 'old', regionId: 'hangzhou', level: 2, observedAt: '1921-04-01', expiresAt: '1921-06-01' }, // 已过期
            { id: 'live', regionId: 'wuhan', level: 1, observedAt: '1921-06-01', expiresAt: '1921-09-01' }, // 未过期
          ],
        },
      },
    }
    const r = scoutCommand({ cityId: 'hangzhou', fromCityId: 'shanghai' }, tree)
    if (!r.ok) throw new Error(r.message)
    const obs = r.effects[0].args.observations as { id: string }[]
    expect(obs.some((o) => o.id === 'old')).toBe(false) // 过期清除
    expect(obs.some((o) => o.id === 'live')).toBe(true) // 未过期保留
    expect(obs.filter((o) => o.id.startsWith('scout-hangzhou'))).toHaveLength(1) // 新观察唯一
  })
})
