// src/engine/trade.ts — 模块 4：商路利润 + 饱和回压（monthly）。M-03 写域：trade/*。
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// 回压生而内置（非补丁，§9.3）；只读 ctx.market（无第二获取路径，B-03 不变量 1）。
//
// §9.3 公式（全部口径单点在 L1 econMath —— 本模块零自算公式）：
//   吞吐 = Σ 同商品在运路线 volume × monthlyTrips（停运/中断不计）
//   饱和度 = 吞吐 / (吞吐 + 参考量)；参考量 = 1200 + 全国供给 × 60
//   压缩后毛价差 = 毛价差 × (1 − 0.7 × saturation)；中价不动，进出各担一半
//   倒挂路线（毛价差非正）不加压
// 饱和度落账 route.saturation —— CareerPanel「你的货量压住了行情 N%」（U-05 表行）。
// 共担：同商品多路线共用同一饱和度（复制同款商路无套利 —— ECO-7）。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree, TradeRoute } from '../validation/tree'
import { transport } from '../data/transport'
import { cities } from '../data/cities'
import {
  referenceVolume, saturationOf, compressSpread, splitAroundMid,
  routeUnitNet, prorateMonthly, cityPriceFactor, freightUnitOf,
} from '../validation/econMath'

// 供给量纲与 market.nationalSupplyOf 同源：产地权重 Σ(1 + economy/50)。
// 骨架口径：供给取常数 10（十城等权近似）—— 参考量 = 1200 + 600 = 1800。
// 复核点：标定五步第③步接四闸后改读 map 供给（此处注释即登记，不许静默改）。
const SKELETON_NATIONAL_SUPPLY = 10

function lineOf(lineId: string): { days: number; baseCost: number; from: string; to: string } | undefined {
  return transport.find((l) => l.id === lineId)
}

export const trade: EngineModule = {
  id: 'trade',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['trade/*', 'economy.commodities'],
  writes: ['trade/*'],
  collect(state, _ctx: TickContext): DomainEffect[] {
    void _ctx
    const tree = state as unknown as Tree
    const routes = Object.values(tree.trade?.routes ?? {})
    if (routes.length === 0) return []

    // ① 同商品吞吐合池（在运 = open 状态；suspended/severed 不计 —— §9.3 原文）
    const throughput: Record<string, number> = {}
    for (const r of routes) {
      if (r.state !== 'open') continue
      throughput[r.commodityId] = (throughput[r.commodityId] ?? 0) + r.volume * Math.max(r.monthlyTrips, 0)
    }

    // ② 每商品饱和度（共担：同商品多路线共用）
    const reference = referenceVolume(SKELETON_NATIONAL_SUPPLY)
    const saturation: Record<string, number> = {}
    for (const [cmd, tp] of Object.entries(throughput)) {
      saturation[cmd] = Math.round(saturationOf(tp, reference) * 10000) / 10000
    }

    // ③ 路线级落账：saturation 落账（进出价在 routeEconomics —— settlement 消费同口径）
    // 停运/中断路线饱和度归零：不压行情就不占饱和位（§9.3「停运/中断不计」的落账面）
    const effects: DomainEffect[] = []
    for (const r of routes) {
      const sat = r.state === 'open' ? (saturation[r.commodityId] ?? 0) : 0
      const next: TradeRoute = { ...r, saturation: sat }
      effects.push({ op: 'routeSet', args: { route: next } })
    }
    return effects
  },
}

// ── 供 settlement/命令层复用的纯计算出口（口径唯一：公式全在 L1 econMath）──────
// settlement 消费本组函数（§9.6「消费 ctx.market 与 trade 口径一致」）。
// 住本文件而不住 L1：函数绑定 trade 域形状（route/line/market 三方），L1 只住无域公式。

export interface RouteEconomics {
  buy: number // 产地买入价（中价 − 压缩价差/2）
  sell: number // 销地卖出价（中价 + 压缩价差/2）
  unitNet: number // 单位净利（压缩价差 − 运费）
  monthNet: number // 月净利（按日折算 days/30 —— settlement 口径）
  saturation: number // 本路线饱和度
}

/** 单条路线的完整经济量（纯函数；settlement 与 UI 共用 —— 无第二口径） */
export function routeEconomics(route: TradeRoute, market: Readonly<Record<string, { price: number }>>): RouteEconomics {
  const line = lineOf(route.lineId)
  const origin = cities.find((c) => c.id === route.origin)
  const dest = cities.find((c) => c.id === route.dest)
  const national = market[route.commodityId]?.price ?? 0
  // 城市价 = 全国中价 × 城市因子（产地折扣 / 销地溢价）
  const originPrice = national * cityPriceFactor(origin?.specialty === route.commodityId)
  const destPrice = national * cityPriceFactor(dest?.specialty === route.commodityId)
  const saturation = route.saturation
  const grossUnit = destPrice - originPrice
  const compressed = compressSpread(grossUnit, saturation)
  const { buy, sell } = splitAroundMid(originPrice, destPrice, compressed)
  const freight = line ? freightUnitOf(line.baseCost) : 0
  const unitNet = routeUnitNet(grossUnit, saturation, freight)
  const trips = Math.max(route.monthlyTrips, 0)
  const monthNet = line ? prorateMonthly(unitNet * route.volume, trips, line.days) : 0
  return {
    buy: Math.round(buy * 100) / 100,
    sell: Math.round(sell * 100) / 100,
    unitNet: Math.round(unitNet * 100) / 100,
    monthNet: Math.round(monthNet * 100) / 100,
    saturation,
  }
}
