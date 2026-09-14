// src/engine/registry.ts — simulationModules()/aftermathModules() 单一权威数组（§十八 M-06/M-12）
// 全仓库唯一一处定义管线顺序（M-06 不变量 1）；返回冻结数组。
// 注册期四校验（M-02）在 scheduler 调用 validateRegistry 时执行。
// 加模块 = 只改本文件 + src/engine/<id>.ts（SX-01：表驱动，不改编排代码）。

import type { EngineModule } from './types'
import { temporal } from './temporal'
import { history } from './history'
import { market } from './market'
import { trade } from './trade'
import { settlement } from './settlement'
import { finance } from './finance'
import { fiscal } from './fiscal'
import { worldtick } from './worldtick'
import { factions } from './factions'
import { labor } from './labor'
import { intelligence } from './intelligence'
import { goals } from './goals'
import { events } from './events'
import { consistency } from './consistency'
import { crisis } from './crisis'
import { memory } from './memory'

// simulation 相位 11 个（注册序 = 执行序，M-12；不得按 id 字典序"顺手"排）
const SIMULATION: readonly EngineModule[] = Object.freeze([
  temporal, // 1  日期 canonical + 货币锚点（monthly）
  history, // 2  史实 claim（monthly；链①-1）
  market, // 3  行情定价（monthly；B-03 唯一发布）
  trade, // 4  商路利润 + 饱和回压（monthly）
  settlement, // 5  按日折算收支（monthly）
  finance, // 6  实业/账本/资金链（monthly）
  fiscal, // 7  控制城税收 → 治安（monthly；链②-1）
  worldtick, // 8  月度漂移六维（monthly；链②-2）
  factions, // 9  势力决策/占领（monthly；链①-2）
  labor, // 10 劳动力投影（full；幂等纯投影）
  intelligence, // 11 情报迷雾（full）
])

// aftermath 相位 5 个（注册序 = 执行序）
const AFTERMATH: readonly EngineModule[] = Object.freeze([
  goals, // 12 月度目标（monthly）
  events, // 13 合池加权抽取（monthly；rng 'events'）
  consistency, // 14 死亡/被捕传播（full；收敛）
  crisis, // 15 破产/哗变检测（full；只检测不改写）
  memory, // 16 规范化/衰减/归档（monthly；链③-1 管家）
])

export function simulationModules(): readonly EngineModule[] {
  return SIMULATION
}

export function aftermathModules(): readonly EngineModule[] {
  return AFTERMATH
}

export function allModules(): readonly EngineModule[] {
  return Object.freeze([...SIMULATION, ...AFTERMATH])
}

// ── M-03 写域登记表（结构化；sanitize 白名单与 sanitize.ts 的投影同源）──────
export const M03_WRITER_CHAINS: Record<string, readonly string[]> = {
  // 有序写者链（M-04）：同域多写者的合法链序（相位内序）
  '_authority.territoryControl': ['history', 'factions', 'OccupationCommand'], // 链①
  'map': ['fiscal', 'worldtick', 'crisis'], // 链②（六维）
  'memory.items': ['memory', 'resolve', 'TurnRunner.extractor'], // 链③（保底先于补写）
}

export function writerChainOf(domain: string): readonly string[] | undefined {
  return M03_WRITER_CHAINS[domain]
}

export type { EngineModule } from './types'
