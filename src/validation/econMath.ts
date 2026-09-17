// src/validation/econMath.ts — 经济口径单点库（§十八 M-11 库层条目）
// 调用方（登记）：trade、settlement —— 折算口径唯一（M-10 settlement：「不重复计息」；
// §9.6「消费 ctx.market 与 trade 口径一致」的结构保证：同一公式只存在这一份）。
// 纯函数：同入同出、不读全局、不读时间/随机（M-11 不变量 3）。
// 住 L1 的依据：被 L2 多模块共用（calendar.ts 先例 —— L1 = 共享纯工具层）。
//
// 数值三问（附录 E 纪律：无依据数值不进场）：
// - SPREAD_PRESSURE 0.7 —— 初值；依据 §9.3 契约公式原文；复核点：回压实测锚三点回归（trade.spec）。
// - REFERENCE_BASE 1200 / REFERENCE_SUPPLY_WEIGHT 60 —— 初值；依据 §9.3「实测初值，标定期可调」；
//   复核点：标定五步第⑤步价格快照。
// - FREIGHT_RATIO 0.15 —— 初值；依据回压锚反推（freight≈1.79/单位 ↔ 典型水运线 baseCost 12）；
//   复核点：标定五步（商路垫资 capital ≈ volume × freight，E-1.4）。
// - PRODUCER_DISCOUNT 0.85 / CONSUMER_PREMIUM 1.05 —— 初值；依据：产地折扣/销地溢价设计
//   （城市价差 = 全国价 × L0 城市因子；动态城市因子接 R3 四闸）；复核点：标定快照。

export const SPREAD_PRESSURE = 0.7 // 回压强度（§9.3）
export const REFERENCE_BASE = 1200 // 参考量基座（§9.3）
export const REFERENCE_SUPPLY_WEIGHT = 60 // 全国供给权重（§9.3）
export const FREIGHT_RATIO = 0.15 // 运费比：线路 baseCost × 比率 = 单位运费
export const PRODUCER_DISCOUNT = 0.85 // 产地城市价因子（specialty 命中）
export const CONSUMER_PREMIUM = 1.05 // 销地城市价因子（specialty 未命中）

/** 参考量（§9.3）：1200 + 全国供给 × 60 —— 稀缺商品先压平 */
export function referenceVolume(nationalSupply: number): number {
  return REFERENCE_BASE + nationalSupply * REFERENCE_SUPPLY_WEIGHT
}

/** 饱和度 = 吞吐 / (吞吐 + 参考量) —— 同商品多路线共担（复制同款商路无套利） */
export function saturationOf(throughput: number, reference: number): number {
  if (reference <= 0) return 1
  return throughput / (throughput + reference)
}

/** 压缩后毛价差 = 毛价差 × (1 − 0.7 × saturation)；倒挂路线（毛价差非正）不加压 */
export function compressSpread(grossUnit: number, saturation: number): number {
  if (grossUnit <= 0) return grossUnit
  const factor = Math.min(Math.max(1 - SPREAD_PRESSURE * saturation, 0), 1)
  return grossUnit * factor
}

/**
 * 中价不动（§9.3 不变式 9）：进价与售价各担一半压缩 —— 压缩后买卖价围绕未变中价对称。
 * @returns { buy, sell } —— buy = mid − 压缩价差/2，sell = mid + 压缩价差/2
 */
export function splitAroundMid(originPrice: number, destPrice: number, compressedSpread: number): { buy: number; sell: number } {
  const mid = (originPrice + destPrice) / 2
  return { buy: mid - compressedSpread / 2, sell: mid + compressedSpread / 2 }
}

/** 单位净利 = 压缩后毛价差 − 单位运费（运费不随行情压：压缩是行情效应，运费是运输成本） */
export function routeUnitNet(grossUnit: number, saturation: number, freightUnit: number): number {
  return compressSpread(grossUnit, saturation) - freightUnit
}

/** 按日折算（E-0.2：统一 settlement 口径 days/30，不出现第二个折算口径） */
export function prorateMonthly(netPerTrip: number, monthlyTrips: number, lineDays: number): number {
  return netPerTrip * monthlyTrips * (lineDays / 30)
}

/** 城市价因子（R1 口径：L0 静态 —— 产地折扣/销地溢价；动态因子接 R3 四闸） */
export function cityPriceFactor(isSpecialtyCity: boolean): number {
  return isSpecialtyCity ? PRODUCER_DISCOUNT : CONSUMER_PREMIUM
}

/** 单位运费 = 线路 baseCost × FREIGHT_RATIO */
export function freightUnitOf(lineBaseCost: number): number {
  return lineBaseCost * FREIGHT_RATIO
}
