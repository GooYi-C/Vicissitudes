// src/turn/resolves.ts — 处境结算管道（§8.4 回合侧；B-08 结算半 / B-09 双重门槛）
// EXEMPT:LAYER-004 见 §十六 L-07 豁免表（turn 管线组合，2026-09-15 登记）
// 结算半与入队半零 import（B-08 不变量 1）：不 import events 模块/事件表 ——
// 消费的是入队时快照的 payload（§8.6：不依赖运行时定义表，库升级不影响旧档）。
//
// §8.4 结算管道：
//   ResolveRef 精确命中本轮可见批次（未过期）→ 双重门槛（结算层第二道门）→
//   payload.options[i].effects → DomainEffect[] →（调用方）compiler → TurnRunner 单次提交
//   → 出队 situationDequeue + 台账 resolvedEvents 追加 + 保底记忆（importance ≥7 → engine item）
// moneyEligible 白名单（B-09-4）：银元/支出只对「旧账催收 + 最早标记 2 件」生效 ——
// 硬事件/模板侧金额已在内容期量纲带拦截（DAT-07），运行时只做非负校验剥除。
//
// 纯函数：同 (situation, optionIndex, state) → 同 DomainEffect[]；不读时钟/随机。

import type { DomainEffect } from '../validation/effects'
import type { Tree, PendingSituation, MemoryItemTree } from '../validation/tree'

export interface ResolveRef {
  key: string // situation key（精确匹配 —— 防陈旧引用）
  optionIndex: number // 选项序（payload.options 下标）
}

export type ResolveResult =
  | { ok: true; effects: DomainEffect[] } // 交调用方走 compiler → TurnRunner（单次提交）
  | { ok: false; reason: 'not-found' | 'expired' | 'bad-option' | 'gate'; message: string }

// ── 结算层门槛（B-09 第二道门；UI 第一道门在面板侧 —— 两道门同规则不同位）──────

/** 门槛检查：可见性（本轮批次）/ 过期 / 选项合法性 —— 三查全过才放行结算 */
export function resolveGate(
  ref: ResolveRef,
  tree: Readonly<Tree>,
): { ok: boolean; situation?: PendingSituation; message?: string } {
  const queue = tree._authority.pendingSituations.queue
  const sit = queue[ref.key]
  if (!sit) return { ok: false, message: `处境 ${ref.key} 不在本轮批次（陈旧引用或已出队）—— 拒绝（B-09-2）` }
  const iso = `${tree.world.date}-01`
  if (sit.expiresAt <= iso) return { ok: false, message: `处境 ${sit.key} 已过期（${sit.expiresAt}）—— 过期不投影替代（EVT-9）` }
  if (ref.optionIndex < 0 || ref.optionIndex >= sit.payload.options.length) {
    return { ok: false, message: `选项序 ${ref.optionIndex} 越界（合法 0–${sit.payload.options.length - 1}）` }
  }
  return { ok: true, situation: sit }
}

// ── 结算本体（纯函数）─────────────────────────────────────────────────

/** 处境结算：payload 快照 + 选项 → DomainEffect[]（出队/台账/保底记忆三条随行） */
export function resolveSituation(ref: ResolveRef, tree: Readonly<Tree>): ResolveResult {
  const gate = resolveGate(ref, tree)
  if (!gate.ok || !gate.situation) return { ok: false, reason: 'gate', message: gate.message ?? '门槛不足' }
  const sit = gate.situation
  const option = sit.payload.options[ref.optionIndex]

  // ① 选项效果透传（payload 快照的 effects 已过内容期 schema —— 运行时不再信任：
  //    非法 op 交 compiler 抛错整批否决；本层只透传 DomainEffect 形状）
  const effects: DomainEffect[] = []
  for (const e of option.effects) {
    const eff = e as { op?: unknown; args?: unknown }
    if (typeof eff.op !== 'string' || !eff.args || typeof eff.args !== 'object') {
      return { ok: false, reason: 'bad-option', message: `选项效果形状非法（op=${String(eff.op)}）—— 整批拒绝` }
    }
    effects.push({ op: eff.op as DomainEffect['op'], args: eff.args as Record<string, unknown> })
  }

  // ② 出队 + 台账追加（结算半写 pendingSituations 的出队位 —— M-03 两写者分工）
  effects.push({ op: 'situationDequeue', args: { key: sit.key } })
  const ledger = tree.events ?? { eventCD: {}, resolvedEvents: [] }
  effects.push({
    op: 'eventsPost',
    args: {
      eventCD: ledger.eventCD,
      resolvedEvents: [
        ...ledger.resolvedEvents,
        { key: sit.key, templateId: sit.templateId, optionIndex: ref.optionIndex, resolvedAt: `${tree.world.date}-01` },
      ],
    },
  })

  // ③ 保底记忆（§7.3 链③-2：importance ≥7 的结算事件自动建 engine 来源 item ——
  // 骨架口径：处境标题含「危/哗变/破产/沦陷/婚/亡」等大事件词 → importance 7；否则 4）
  const bigWords = ['危', '哗变', '破产', '沦陷', '婚', '亡', '抓', '匪']
  const isBig = bigWords.some((w) => sit.payload.title.includes(w) || sit.payload.desc.includes(w))
  if (isBig) {
    const item: MemoryItemTree = {
      id: `m${monthOf(tree)}-${sit.key.replace(/[^a-z0-9-]/gi, '')}`,
      type: 'event',
      title: sit.payload.title,
      content: `${sit.payload.desc}（你选择了：${option.text}）`,
      importance: 7,
      pinned: false,
      archived: false,
      people: [],
      monthIndex: monthOf(tree),
      createdAt: `${tree.world.date}-01`,
      source: 'engine', // 保底条目来源可观测（§7.2）
    }
    effects.push({ op: 'memoryWrite', args: { item } })
  }

  return { ok: true, effects }
}

function monthOf(tree: Readonly<Tree>): number {
  const y = Number(tree.world.date.slice(0, 4))
  const m = Number(tree.world.date.slice(5, 7))
  return (y - 1921) * 12 + (m - 1) // EPOCH 1921-01（与 calendar.monthIndexFrom 同源口径）
}
