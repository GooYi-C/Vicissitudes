// src/engine/worldtick.ts — 模块 8：月度漂移——map/* 六维、人口、季节粮价（monthly；链②-2 后于 fiscal）。
// M-03 写域：map/* 六维、人口、季节粮价（seasonal 参数域）。
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// 事件效果不直写六维（经 B-08 cityEffect 指令映射 —— 本模块只做自然漂移）。
//
// 漂移模型（初值；依据：六维 ∈ [0,100] 的回归中值设计；复核点：12 月闭环快照）：
//   六维：每维向城市自身 L0 基准回归 ±0.3 均值回复（繁荣城不因噪声永久漂走）
//         ＋ rng ±0.8 月噪声（ctx.rng('worldtick') —— 同月确定）
//   人口：±0.4 噪声（长期稳定 —— 大迁移动态接 R3 war 域）
//   季节粮价：秋收月（9–10）0.85 / 青黄不接（4–5）1.2 / 其余 1.0
//     （§9.2 分工：worldtick 只落季节参数，改价由 market 下月消费 —— market 是唯一改价者）
// map 未播种（开局空表）→ 首月从 L0-04 城市表播种全部 14 城六维（初值来自数据非代码）。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree, CityDims } from '../validation/tree'
import { cities } from '../data/cities'

const DIM_KEYS = ['economy', 'security', 'culture', 'transport', 'industry', 'population'] as const


// 季节粮价表（月 → 因子）：秋收低、青黄不接高 —— 依据农业周期常识；复核点：E-1.3 通胀体验带
const SEASONAL_GRAIN: Readonly<Record<number, number>> = Object.freeze({
  1: 1.05, 2: 1.05, 3: 1.1, 4: 1.2, 5: 1.2, 6: 1.1,
  7: 1.0, 8: 0.95, 9: 0.85, 10: 0.85, 11: 0.9, 12: 1.0,
})

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export const worldtick: EngineModule = {
  id: 'worldtick',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['map/*', 'economy.commodities', 'world.date'],
  writes: ['map/*'],
  collect(state, ctx: TickContext): DomainEffect[] {
    const tree = state as unknown as Tree
    const map = tree.map ?? {}
    const rng = ctx.rng('worldtick')
    const date = tree.world?.date ?? ''
    const monthNum = Number(date.slice(5, 7))

    const effects: DomainEffect[] = []

    // 首月播种：map 空 → L0-04 城市表初值落树（此后引擎态与数据表解耦）
    // 播种按「城市级整体落账」（citySeed 携带全部六维 —— CityDimsSchema 要求六维
    // 全量，逐维中间态进不了树形状；漂移月才走逐维 cityEffect 差分）
    const seeded = Object.keys(map).length > 0
    if (!seeded) {
      for (const c of cities) {
        effects.push({ op: 'citySeed', args: { cityId: c.id, dims: { ...c.dims } } })
      }
      // 季节参数照常落账（首月即可能非中性月）
      const grainFactor0 = SEASONAL_GRAIN[monthNum] ?? 1
      const current0 = tree.seasonal?.grainFactor ?? 1
      if (grainFactor0 !== current0) {
        effects.push({ op: 'setSeasonal', args: { month: monthNum, grainFactor: grainFactor0 } })
      }
      return effects
    }

    // 漂移月：均值回复 ±0.3 ＋ 噪声 ±0.8（六维逐维独立抽样 —— 次序即序列：DIM_KEYS 序属契约）
    // 只漂移已播种城（map 有值）；未播种城本月由 citySeed 补种（部分播种的中间态月）
    const nextMap: Record<string, CityDims> = {}
    for (const c of cities) {
      const dims = map[c.id]
      if (!dims) {
        effects.push({ op: 'citySeed', args: { cityId: c.id, dims: { ...c.dims } } })
        continue
      }
      const drifted: Record<string, number> = {}
      for (const k of DIM_KEYS) {
        const base = dims[k] as number
        const revert = (c.dims[k] as number) > base ? 0.3 : (c.dims[k] as number) < base ? -0.3 : 0
        drifted[k] = Math.min(100, Math.max(0, round1(base + revert + (rng.next() - 0.5) * 1.6)))
      }
      nextMap[c.id] = drifted as unknown as CityDims
    }

    for (const [cityId, dims] of Object.entries(nextMap)) {
      for (const k of DIM_KEYS) {
        const before = map[cityId]?.[k] as number | undefined
        const after = dims[k] as number
        if (before !== undefined && after !== before) {
          effects.push({ op: 'cityEffect', args: { cityId, dim: k, delta: round1(after - before) } })
        }
      }
    }

    // 季节粮价参数落账（market 下月消费 —— §9.2「季节粮价进 market 一处」的分工面）
    const grainFactor = SEASONAL_GRAIN[monthNum] ?? 1
    const current = tree.seasonal?.grainFactor ?? 1
    if (grainFactor !== current) {
      effects.push({ op: 'setSeasonal', args: { month: monthNum, grainFactor } })
    }

    return effects
  },
}
