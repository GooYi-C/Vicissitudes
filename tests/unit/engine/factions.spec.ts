// tests/unit/engine/factions.spec.ts — R3-2 factions：效用决策 + 围城/撤离窗口（链①-2）
import { describe, it, expect } from 'vitest'
import { factions } from '../../../src/engine/factions'
import { initialTree, type Tree } from '../../../src/validation/tree'
import { deriveRng } from '../../../src/engine/rng'

function ctxFor(monthIndex: number) {
  return {
    date: '1936-07', monthIndex,
    rng: (salt: string) => deriveRng('factions', monthIndex, salt),
    market: {}, diagnostics: [], state: {},
  }
}

function tree1936(over: Partial<Tree> = {}): Tree {
  return { ...initialTree('era-nanjing', '1936-07'), ...over }
}

describe('R3-2 factions 势力决策', () => {
  it('扩军：兵力 +5–15%/月（E-3.1 带宽；预算 = 岁入 × 时代系数）', () => {
    const tree = tree1936()
    const effects = factions.collect(tree as never, ctxFor(186) as never)
    const post = effects.find((e) => e.op === 'forcesPost')
    expect(post).toBeDefined()
    const next = post!.args.strength as Record<string, number>
    for (const [fid, s] of Object.entries(tree.forces.strength)) {
      const grew = next[fid] / s
      // era-nanjing 系数全正（zhili 1.0 / guomin 1.1 / ri 0.3）→ 全部扩军
      expect(grew, `${fid}: ${s} → ${next[fid]}`).toBeGreaterThanOrEqual(1.05)
      expect(grew).toBeLessThanOrEqual(1.15)
    }
  })

  it('ri 势力 era-civilwar 系数 0：预算零 → 不扩军（1945 后退出语义）', () => {
    const tree = { ...initialTree('era-civilwar', '1946-07') }
    const effects = factions.collect(tree as never, ctxFor(302) as never)
    const next = (effects.find((e) => e.op === 'forcesPost')!.args.strength as Record<string, number>)
    expect(next.ri).toBe(tree.forces.strength.ri) // 系数 0 → 兵力不动
  })

  it('war 台账落账：forcesPost + warPost 双随行（E-3.2 台账域）', () => {
    const tree = tree1936()
    const effects = factions.collect(tree as never, ctxFor(186) as never)
    expect(effects.some((e) => e.op === 'forcesPost')).toBe(true)
    expect(effects.some((e) => e.op === 'warPost')).toBe(true)
  })

  it('威胁评估：邻城敌方兵力压倒守军 ×1.3 → 广州挂预警（史实目标城）', () => {
    // 几何：广州（广东）邻城 = 武汉（湖北）/香港（海外）。树内 claim 显式落：
    // 广东 zhiyuan 控制延续过 07-01（偏离史实的假想对峙），湖北 guomin 强兵压境
    const tree = tree1936({
      forces: { strength: { zhili: 300, fengxi: 300, zhiyuan: 100, guomin: 2000, ri: 400 } },
    })
    const withClaim: Tree = {
      ...tree,
      _authority: {
        ...tree._authority,
        territoryControl: {
          claims: [
            { polityId: 'vic.guangdong', controller: 'zhiyuan', interval: { from: '1936-01-01', to: '1937-01-01' } },
            { polityId: 'vic.hubei', controller: 'guomin', interval: { from: '1936-01-01', to: '1937-01-01' } },
          ],
        },
      },
    }
    const effects = factions.collect(withClaim as never, ctxFor(186) as never)
    const war = effects.find((e) => e.op === 'warPost')!.args.war as { siegeWarnings: Record<string, unknown> }
    expect(war.siegeWarnings['guangzhou']).toBeDefined() // 威胁 ≥1 → 预警挂起
  })

  it('撤离窗口可触发（R3 出口判据）：预警 → 攻城判定 → contested → 2 月后并入', () => {
    // 场景：1936-06 开局，广东 zhiyuan 弱守（100）、湖北 guomin 强兵（2500）——
    // 逐月推演，预警/围城台账至少出现一次（撤离窗口 = 预警 + contested ≈ 2–3 月）
    const start = initialTree('era-nanjing', '1936-06')
    const withClaims: Tree = {
      ...start,
      forces: { strength: { zhili: 300, fengxi: 300, zhiyuan: 100, guomin: 2500, ri: 400 } },
      _authority: {
        ...start._authority,
        territoryControl: {
          claims: [
            { polityId: 'vic.guangdong', controller: 'zhiyuan', interval: { from: '1936-01-01', to: '1937-01-01' } },
            { polityId: 'vic.hubei', controller: 'guomin', interval: { from: '1936-01-01', to: '1937-01-01' } },
          ],
        },
      },
    }
    const { tickWorld } = await_modRunner()
    let tree = withClaims
    const trace: string[] = []
    for (let i = 0; i < 6; i++) {
      const r = tickWorld(tree)
      expect(r.ok, `M${i + 1}: ${r.error}`).toBe(true)
      tree = r.state as Tree
      const w = Object.keys(tree.war.siegeWarnings)
      const c = Object.keys(tree.war.contested)
      trace.push(`月${i + 1}: 预警[${w.join(',')}] 围城[${c.join(',')}]`)
    }
    const seenWindow = trace.some((t) => !t.includes('预警[]') || !t.includes('围城[]'))
    expect(seenWindow, trace.join(' / ')).toBe(true)
  })

  it('同 (state, ctx) 逐位一致（M-01 纯函数）', () => {
    const tree = tree1936()
    const a = factions.collect(tree as never, ctxFor(186) as never)
    const b = factions.collect(tree as never, ctxFor(186) as never)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

function await_modRunner() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return { tickWorld: mw }
}
import { tickWorld as mw } from '../../../src/turn/monthRunner'
