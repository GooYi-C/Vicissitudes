// src/engine/intelligence.ts — 模块 11：四级情报迷雾、过期衰减（full）。
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：_authority.intelligenceObservations。侦察写入走命令层（scout 一次侦察给 2 级、
// 3 月时效——E-2.4 眼线口径）；本模块只管另一半「衰减」：终月关账剔除 expiresAt ≤ 当月首日
// 的观察项——「intelligenceObservations 无过期衰减项残留」（R4 卡失败判据矛点）。
//
// full 仅终月跑（M-05）：时效判定是纯 ISO 比较，幂等（同输入同果；无残留项即零产出）。
// 四级情报迷雾的等级语义（0 无 / 1 风闻 / 2 驻军规模 / 3 城防部署）由写入侧（命令层）与
// 消费侧（IntelPanel）承载；本模块不创造观察、不抬降级（衰减面 = 时效落网，先求不漏）。
// 消费侧边界（如实登记）：命令层 Occupation 情报检查尚未按 expiresAt 复核——随内容期
// 消费口径统一（本模块保证台账面无过期残留，读时复核是消费侧职责的另一半）。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree } from '../validation/tree'

export const intelligence: EngineModule = {
  id: 'intelligence',
  phase: 'simulation',
  cadence: 'full',
  reads: ['_authority.intelligenceObservations', 'world.date'],
  writes: ['_authority.intelligenceObservations'],
  collect(state, _ctx: TickContext): DomainEffect[] {
    void _ctx
    const tree = state as unknown as Tree
    const date = tree.world?.date ?? ''
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return []

    const iso = `${date}-01`
    const obs = tree._authority?.intelligenceObservations?.observations ?? []
    const kept = obs.filter((o) => o.expiresAt > iso) // 过期剔除（台账面无残留）
    if (kept.length === obs.length) return [] // 幂等：无衰减即零产出
    return [{ op: 'intelPost', args: { observations: kept } }]
  },
}
