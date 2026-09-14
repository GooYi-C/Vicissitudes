// src/engine/types.ts — EngineModule 接口（§十八 M-01）与 Operation 承接
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（本文件 = L2 接口定义处，16 模块单向引用豁免）
// 接口定义住 L2（L-05 不变量 1：接口住被依赖的那一层）。
// collect 纯函数：同 (state, ctx) → 同 Operation[]；只产出不提交 —— 模块碰不到持久层。

import type { DomainEffect } from '../validation/effects'

// M-03 写域登记表的域前缀类型（字符串前缀匹配：'map/*' 声明覆盖 'map/wuhan/security'）
export type DomainPrefix = string

export type Phase = 'simulation' | 'aftermath'
export type Cadence = 'monthly' | 'full'

// TickContext（§十九 B-01 —— 定义处名义上在 L3 world.ts；此处为 L2 可消费的只读结构，
// 实体由 L3 构造并注入；L2 不得反向 import L3，故接口形状在 L2 声明、L3 实现满足它）
export interface Diagnostic {
  moduleId: string
  code: 'WRITE_OUT_OF_DOMAIN' | 'READ_ORDER_VIOLATION' | 'SANITIZE_STRIPPED' | 'RUNTIME_GUARD'
  monthIndex: number
  path?: string
  detail?: string
}

export interface Rng {
  next(): number
  int(maxExcl: number): number
  pick<T>(xs: readonly T[]): T
}

export interface TickContext {
  readonly date: string // 当月快照 YYYY-MM（canonical 只读投影）
  readonly monthIndex: number // 全局月序（rng 派生与审计共用）
  readonly rng: (salt: string) => Rng // 按 (模块id, monthIndex, salt) 派生（B-02）
  readonly market: Readonly<Record<string, { price: number; trend: number }>> // B-03 唯一发布路径
  readonly diagnostics: Diagnostic[]
  readonly state: Readonly<Record<string, unknown>> // 只读视图（已提交 ops 后最新态）
}

export interface EngineModule {
  readonly id: string // 稳定标识；写域登记表行键；跨版本稳定
  readonly phase: Phase // 相位由 M-12 固定，不由模块自选
  readonly cadence: Cadence // 语义见 M-05
  readonly reads: readonly DomainPrefix[] // 受 M-02-3 读序纪律约束
  readonly writes: readonly DomainPrefix[] // 受 M-02-1 越界即报约束
  collect(state: Readonly<Record<string, unknown>>, ctx: TickContext): DomainEffect[]
}
