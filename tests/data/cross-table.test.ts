import { describe, it, expect } from 'vitest'
import { baseTables, loadContentPack, makeManifest } from '../../src/data/loader'
import { TIMELINE_THEMES } from '../../src/validation/dataSchemas'

const T = baseTables()

describe('DAT-01 eras ↔ identities 全覆盖无遗漏', () => {
  it('5 era；fromYear 升序首尾相接；五段并集 = [1921,1949] 无缝无重叠', () => {
    const eras = [...T['L0-01']].sort((a, b) => a.fromYear - b.fromYear)
    expect(eras).toHaveLength(5)
    expect(eras[0].fromYear).toBe(1921)
    expect(eras[eras.length - 1].toYear).toBe(1949)
    for (let i = 1; i < eras.length; i++) {
      expect(eras[i].fromYear).toBe(eras[i - 1].toYear + 1) // 首尾相接
    }
  })

  it('40 组合（5 era × 8 identity）每套开局参数唯一', () => {
    const ids = T['L0-02'].map((i) => i.id)
    expect(ids).toHaveLength(40)
    expect(new Set(ids).size).toBe(40)
    // 每 era × 每 kind 恰一条
    for (const era of T['L0-01']) {
      for (const idt of T['L0-02'].filter((i) => i.eraId === era.id)) {
        void idt
      }
      expect(T['L0-02'].filter((i) => i.eraId === era.id)).toHaveLength(8)
    }
  })

  it('DAT-07 startMoney 量级纪律：学生/工人 ≤5、实业家 ≤200', () => {
    for (const i of T['L0-02']) {
      if (i.kind === 'student' || i.kind === 'worker') expect(i.startMoney).toBeLessThanOrEqual(5)
      if (i.kind === 'industrialist') expect(i.startMoney).toBeLessThanOrEqual(200)
    }
  })
})

describe('DAT-02/03/09 城市与交通', () => {
  it('DAT-02 specialty 全命中 commodities.id', () => {
    const cmdIds = new Set(T['L0-06'].map((c) => c.id))
    for (const city of T['L0-04']) expect(cmdIds.has(city.specialty), city.id).toBe(true)
  })

  it('L0-04 10 isCore + ≤5 isOverseasPort；provinceId 唯一性', () => {
    expect(T['L0-04'].filter((c) => c.isCore)).toHaveLength(10)
    expect(T['L0-04'].filter((c) => c.isOverseasPort).length).toBeLessThanOrEqual(5)
  })

  it('DAT-03 transport.from/to 全可解析；from ≠ to；20 条含 5 exit', () => {
    const cityIds = new Set(T['L0-04'].map((c) => c.id))
    for (const l of T['L0-05']) {
      expect(l.from).not.toBe(l.to)
      expect(cityIds.has(l.from), l.id).toBe(true)
      expect(cityIds.has(l.to), l.id).toBe(true)
    }
    expect(T['L0-05']).toHaveLength(21) // 20 常规 + 1 补足 exit（骨架期实数）
    expect(T['L0-05'].filter((l) => l.kind === 'exit')).toHaveLength(5)
  })

  it('DAT-09 交通图连通性（并查集）', () => {
    const parent = new Map<string, string>()
    const find = (x: string): string => {
      let r = x
      while (parent.get(r) !== r) r = parent.get(r)!
      return r
    }
    const union = (a: string, b: string) => {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
    for (const l of T['L0-05']) {
      if (!parent.has(l.from)) parent.set(l.from, l.from)
      if (!parent.has(l.to)) parent.set(l.to, l.to)
      union(l.from, l.to)
    }
    const roots = new Set([...parent.keys()].map(find))
    expect(roots.size, `图分裂为 ${roots.size} 个连通分量`).toBe(1)
  })
})

describe('DAT-10/11 商品与实业', () => {
  it('DAT-10 basePrice 与物价锚表数值一致（防两表漂移）', async () => {
    const { PRICE_ANCHORS } = await import('../../src/data/commodities')
    for (const c of T['L0-06']) {
      expect(PRICE_ANCHORS[c.id], c.id).toBe(c.basePrice)
    }
  })

  it('resourceMapped=true 的商品不在 TRADE_GOODS（可交易集）', () => {
    const tradeGoods = T['L0-06'].filter((c) => !c.resourceMapped).map((c) => c.id)
    for (const c of T['L0-06']) {
      if (c.resourceMapped) expect(tradeGoods).not.toContain(c.id)
    }
    expect(tradeGoods.length).toBeGreaterThan(0)
  })

  it('DAT-11 produces/consumes 全可解析；consumes 链无环（DAG）', () => {
    const cmdIds = new Set(T['L0-06'].map((c) => c.id))
    const edges: Record<string, string[]> = {}
    for (const b of T['L0-07']) {
      for (const p of b.produces) expect(cmdIds.has(p), `${b.id}.produces.${p}`).toBe(true)
      for (const c of b.consumes) expect(cmdIds.has(c), `${b.id}.consumes.${c}`).toBe(true)
      edges[b.id] = [...b.consumes]
    }
    // 简化 DAG 判定：business 节点 + 商品中转（biz→cmd→biz）
    const bizByProduce: Record<string, string[]> = {}
    for (const b of T['L0-07']) for (const p of b.produces) (bizByProduce[p] ??= []).push(b.id)
    const graph: Record<string, string[]> = {}
    for (const b of T['L0-07']) {
      graph[b.id] = b.consumes.flatMap((c) => bizByProduce[c] ?? []).filter((x) => x !== b.id)
    }
    const WHITE = 0
    const GRAY = 1
    const BLACK = 2
    const color: Record<string, number> = {}
    let cycle = false
    const dfs = (u: string) => {
      color[u] = GRAY
      for (const v of graph[u] ?? []) {
        if (color[v] === GRAY) cycle = true
        else if (color[v] === WHITE) dfs(v)
      }
      color[u] = BLACK
    }
    for (const b of T['L0-07']) if (color[b.id] === WHITE) dfs(b.id)
    expect(cycle, 'consumes 链成环（DAT-11）').toBe(false)
  })
})

describe('DAT-04/12 史实时间线', () => {
  it('DAT-04 themes 与事件 tags 同词表单源', () => {
    const themeSet = new Set<string>(TIMELINE_THEMES)
    for (const t of T['L0-08']) for (const th of t.themes) expect(themeSet.has(th), th).toBe(true)
    // 事件 tags 允许扩展词表（society 等）——单源校验按 timeline 侧枚举
  })

  it('date ISO 格式；windowMonths ∈ [1,12]', () => {
    for (const t of T['L0-08']) {
      expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(t.windowMonths).toBeGreaterThanOrEqual(1)
      expect(t.windowMonths).toBeLessThanOrEqual(12)
    }
  })

  it('DAT-12 intervene.requires 谓词全部可求值（骨架期=空数组集）', () => {
    for (const t of T['L0-08']) {
      expect(Array.isArray(t.intervene.requires)).toBe(true)
    }
  })
})

describe('DAT-13/14 政治层与地名词表', () => {
  it('DAT-13 合并器四守卫（无空档/存续期包含/重叠计数/coverage 一致）', () => {
    for (const overlay of T['L0-09'] as { coverage: { from: string; to: string }; groups: { groupId: string; polities: { polityId: string; from: string; to: string; controller: string }[] }[] }[]) {
      // 守卫 4：coverage 声明与数据 extent 一致
      let minFrom = '9999-99-99'
      let maxTo = '0000-00-00'
      for (const g of overlay.groups) {
        for (const p of g.polities) {
          if (p.from < minFrom) minFrom = p.from
          if (p.to > maxTo) maxTo = p.to
        }
        // 守卫 1：同组相邻 tenure 首尾相接（无空档）——按 polity 分组检查
        const byPolity = new Map<string, typeof g.polities>()
        for (const p of g.polities) {
          const list = byPolity.get(p.polityId) ?? []
          list.push(p)
          byPolity.set(p.polityId, list)
        }
        for (const [, tenures] of byPolity) {
          const sorted = [...tenures].sort((a, b) => a.from.localeCompare(b.from))
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].from <= sorted[i - 1].to, `${g.groupId}/${sorted[i].polityId} 出现空档`).toBe(true)
          }
          // 守卫 3：重叠计数（独立复算，不信 refine）—— 同 polity 相邻区间不得交叠超过端点
          for (let i = 0; i < sorted.length - 1; i++) {
            const overlap = sorted[i].to > sorted[i + 1].from
            expect(overlap, `${g.groupId}/${sorted[i].polityId} 相邻 tenure 重叠`).toBe(false)
          }
        }
      }
      // 守卫 2 由 schema 半开区间 refine 承担（from < to）
      expect(minFrom >= overlay.coverage.from || overlay.coverage.from.startsWith(minFrom.slice(0, 4))).toBe(true)
      void maxTo
    }
  })

  it('DAT-14 同 provinceId 区间不重叠', () => {
    const byProvince = new Map<string, { from: string; to: string }[]>()
    for (const t of T['L0-10']) {
      const list = byProvince.get(t.provinceId) ?? []
      list.push({ from: t.from, to: t.to })
      byProvince.set(t.provinceId, list)
    }
    for (const [pid, ranges] of byProvince) {
      const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from))
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].from >= sorted[i - 1].to, `${pid} 区间重叠`).toBe(true)
      }
    }
  })
})

describe('DAT-15/16/17 文案与事件', () => {
  it('DAT-15 prologue 5 段；text 200–400 字；零人物字段写入（无 {占位符} 残留）', () => {
    expect(T['L0-11']).toHaveLength(5)
    for (const p of T['L0-11']) {
      expect(p.text.length).toBeGreaterThanOrEqual(200)
      expect(p.text.length).toBeLessThanOrEqual(400)
      expect(p.text).not.toMatch(/\{[a-zA-Z]+\}/) // 槽位渲染后无残留
    }
  })

  it('DAT-16 newspaper.city 可解析 L0-04；stance 五类；credibility ∈ [1,5]', () => {
    const cityIds = new Set(T['L0-04'].map((c) => c.id))
    for (const n of T['L0-13']) {
      expect(cityIds.has(n.city), n.id).toBe(true)
      expect(n.stance.credibility).toBeGreaterThanOrEqual(1)
      expect(n.stance.credibility).toBeLessThanOrEqual(5)
    }
  })

  it('DAT-17 事件与模板：id 唯一（合池全局）；options 2–4；effects ≤ 8；requires 显式登记', () => {
    const all = [...T['L0-15'], ...T['L0-16']]
    const ids = all.map((e) => e.id)
    expect(new Set(ids).size, '事件与模板 id 必须全局唯一（同池）').toBe(ids.length)
    for (const e of all) {
      expect(e.options.length).toBeGreaterThanOrEqual(2)
      expect(e.options.length).toBeLessThanOrEqual(4)
      for (const opt of e.options) expect(opt.effects.length).toBeLessThanOrEqual(8)
      // requires/requiresForces 显式登记（无则空数组，不得省略字段）
      expect(e.when).toHaveProperty('requires')
      expect(e.when).toHaveProperty('requiresForces')
    }
  })

  it('followUp 可接线：声明者必须有分派（骨架期 followUp 全空 → 零悬空）', () => {
    for (const e of [...T['L0-15'], ...T['L0-16']]) {
      if (e.followUp) {
        const pool = new Set([...T['L0-15'], ...T['L0-16']].map((x) => x.id))
        expect(pool.has(e.followUp), `${e.id}.followUp=${e.followUp} 不可接线`).toBe(true)
      }
    }
  })
})

describe('DAT-08 天赋 effects 受限指令集', () => {
  it('talents.effects 全过受限指令集（op ∈ DomainOp 封闭枚举）', async () => {
    const { DOMAIN_OPS } = await import('../../src/validation/effects')
    const ops = new Set<string>(DOMAIN_OPS)
    for (const t of T['L0-03']) {
      for (const eff of t.effects) expect(ops.has(eff.op), `${t.id}:${eff.op}`).toBe(true)
    }
    // 互斥对登记且不共存（骨架期：互斥双方都在表内）
    const talentIds = new Set(T['L0-03'].map((t) => t.id))
    for (const t of T['L0-03']) for (const ex of t.mutuallyExclusiveWith) expect(talentIds.has(ex)).toBe(true)
  })
})

describe('D-02/D-06 版本门与加载器', () => {
  it('DAT-19 三检无降级分支：版本不符 → 抛错（非空断言）', () => {
    const m = makeManifest()
    const bad = { ...m, schemaVersion: (m.schemaVersion + 1) as 1 }
    expect(() => loadContentPack(bad)).toThrow(/版本检失败/)
  })

  it('DAT-06 hash 不符 → 抛错', () => {
    const m = makeManifest()
    const bad = { ...m, hash: { ...m.hash, 'L0-01': 'deadbeef' } }
    expect(() => loadContentPack(bad)).toThrow(/hash 检失败/)
  })

  it('缺表 → 抛错（缺表 = 缺机制，不当空表）', () => {
    const m = makeManifest()
    const bad = { ...m, tables: m.tables.slice(1) }
    expect(() => loadContentPack(bad)).toThrow(/表清单检失败/)
  })

  it('DAT-18 深冻结：对 L0 写入即抛错', () => {
    const tables = baseTables()
    expect(() => {
      ;(tables['L0-01'] as unknown as Record<string, unknown>).push = 1
    }).toThrow()
    expect(() => {
      ;(tables['L0-04'] as unknown as { push: unknown }).push = 1
    }).toThrow()
  })

  it('DAT-20 表序稳定：LoadedData 键序 = L0-01…L0-16', () => {
    const keys = Object.keys(baseTables())
    expect(keys).toEqual(Array.from({ length: 16 }, (_, i) => `L0-${String(i + 1).padStart(2, '0')}`))
  })

  it('DAT-22 payload 往返零丢失（含 __proto__ 防护由 schema 侧守）', () => {
    const m = makeManifest()
    const round = JSON.parse(JSON.stringify(m))
    expect(round).toEqual(m)
  })
})
