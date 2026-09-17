// src/engine/adjacency.ts — M-11 adjacency 库（region 邻接聚合；L2 库层 —— 不注册不参与管线）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// 调用方（M-11 唯一性）：factions、OccupationCommand —— 邻接聚合单点，不双份。
// 健康度断言：邻接缺失即失败（不静默降级 —— M-11 原文）。
// 纯函数：同图同结果；exit 线路无占领语义不计邻接。

import { cities } from '../data/cities'
import { transport } from '../data/transport'

export interface AdjacencyGraph {
  /** 城市 → 邻城集合（不含自身；exit 线路不计） */
  readonly neighbors: ReadonlyMap<string, ReadonlySet<string>>
  /** 邻接跳数（BFS 最短路；同城 0 / 邻接 1 / 不可达 Infinity） */
  hopDistance(from: string, to: string): number
}

export function buildAdjacency(): AdjacencyGraph {
  const neighbors = new Map<string, Set<string>>()
  for (const c of cities) neighbors.set(c.id, new Set())
  for (const line of transport) {
    if (line.kind === 'exit') continue
    const a = neighbors.get(line.from)
    const b = neighbors.get(line.to)
    if (!a || !b) throw new Error(`邻接健康度：线路 ${line.id} 端点不在城市表（${line.from}↔${line.to}）`)
    a.add(line.to)
    b.add(line.from)
  }
  // 健康度断言：孤城即失败（覆盖缺口不静默）
  for (const [cityId, set] of neighbors) {
    if (set.size === 0) throw new Error(`邻接健康度：城市 ${cityId} 无邻接线（L0-05 覆盖缺口）`)
  }

  const hopDistance = (from: string, to: string): number => {
    if (from === to) return 0
    // BFS（图 ≤14 节点 —— 每次查询全跑可接受；稳定序：Set 插入序）
    const visited = new Set([from])
    let frontier = [from]
    let hops = 0
    while (frontier.length > 0) {
      hops++
      const next: string[] = []
      for (const node of frontier) {
        for (const nb of neighbors.get(node) ?? []) {
          if (nb === to) return hops
          if (!visited.has(nb)) { visited.add(nb); next.push(nb) }
        }
      }
      frontier = next
    }
    return Infinity
  }

  return { neighbors, hopDistance }
}
