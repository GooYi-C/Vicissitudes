// src/engine/events.ts — 模块 13：三来源同池加权抽取——硬事件+模板（0.5×）+街谈（monthly）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：_authority.pendingSituations（入队）、events/*（台账）。
// rng 走 ctx.rng('events')（B-02 salt 契约）；入队与结算分属两半（B-08 —— 本文件只有入队侧）。
//
// §8.3 触发管道（每月 tick）：
//   候选 = 全库过滤（when.eras 年代门；城市/身份门数据留空 = 不加门 —— 横跨全期强加失真）
//   → 冷却（台账 ISO 日期，真实天数差；cdMonths 差值用月序近似天数 ×30 —— 无第二日期源）
//   → 氛围窗口加权（史实窗口 tag ×3 / 无命中 ×1；suppress ×0.2 留 R3 接线位）
//   → 合池（硬事件 weight + 模板 0.5×；街谈运行时来源 —— LLM 层挂账，零调用路径不产街谈）
//   → 加权抽取（ctx.rng('events') 月序派生；抽样次序属契约 —— 候选按表序、抽取循环在后）
//   → 约束：单轮处境 ≤2、模板侧 ≤1（§8.3 原文）
//   → 入队 ops（稳定 situation key：{来源id}#{月序}；expiresAt = 当月+1 月 —— LL-05 玩家裁决窗）
//
// 数值三问：
// - 队列上限 10（E-3.4 旧实测）；单轮 ≤2 / 模板 ≤1（§8.3 原文）
// - 到期窗 1 月（不点即过期 —— LL-05；过期不投影替代，EVT-9 由 resolves 侧守）
// - 模板权重 0.5×（§8.3 合池原文）

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree } from '../validation/tree'
import type { EventDef } from '../validation/dataSchemas'
import { events as eventTable } from '../data/events'
import { situationTemplates } from '../data/situationTemplates'
import { timeline } from '../data/timeline'

const MAX_QUEUE = 10 // E-3.4 队列上限（旧实测；复核：UI 拥挤度）
const MAX_PER_MONTH = 2 // §8.3 单轮处境 ≤2
const MAX_TEMPLATES_PER_MONTH = 1 // §8.3 模板侧 ≤1
const TEMPLATE_WEIGHT_FACTOR = 0.5 // §8.3 模板合池 0.5×
const ATMOSPHERE_BOOST = 3 // 史实窗口 tag ×3（§8.3 氛围窗口加权）
const EXPIRY_MONTHS = 2 // 到期窗：arrivedAt M → expiresAt M+2（玩家实际可动窗口 = M+1 整月 ——
// tick 提交后日期已进 M+1，LL-05「不点即过期」的裁决窗以玩家可见月为准）

// 候选条目（合池后的统一形状 —— 来源三途同池）
interface Candidate {
  def: EventDef // 事件或模板（模板 schema 是事件的扩展）
  source: 'event' | 'template'
  weight: number // 已含氛围窗口修正与模板 0.5×
}

// 年代门：when.eras 区间数组（双窗口原生）；空 = 全期不加门
function eraGate(def: EventDef, year: number): boolean {
  if (def.when.eras.length === 0) return true
  return def.when.eras.some(([from, to]) => year >= from && year <= to)
}

// 冷却：台账 ISO 日期 → 真实天数差（月粒度近似：月序差 ×30 —— 天数库不引第二日期源）
function cooldownMonthsPassed(lastISO: string | undefined, monthIndex: number, epoch: { year: number; month: number }): number {
  if (!lastISO) return Infinity
  const y = Number(lastISO.slice(0, 4))
  const m = Number(lastISO.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return Infinity
  const lastIndex = (y - epoch.year) * 12 + (m - 1)
  return monthIndex - lastIndex
}

// 氛围窗口：当月史实窗口激活的 themes 集合；命中 tag → ×ATMOSPHERE_BOOST
function activeThemes(monthIndex: number, epoch: { year: number; month: number }): Set<string> {
  const year = epoch.year + Math.floor((epoch.month - 1 + monthIndex) / 12)
  const month = ((epoch.month - 1 + monthIndex) % 12) + 1
  const themes = new Set<string>()
  for (const t of timeline) {
    const ty = Number(t.date.slice(0, 4))
    const tm = Number(t.date.slice(5, 7))
    if (ty !== year) continue // 窗口不跨年（windowMonths ≤12 且骨架表同年起）
    const deltaMonths = (year - ty) * 12 + (month - tm)
    if (deltaMonths >= 0 && deltaMonths < t.windowMonths) {
      for (const th of t.themes) themes.add(th)
    }
  }
  return themes
}

// ISO 日期推进（月粒度 —— 只在本模块内构造 arrivedAt/expiresAt，canonical 日期仍是 world.date）
function isoPlusMonths(base: string, months: number): string {
  const y = Number(base.slice(0, 4))
  const m = Number(base.slice(5, 7))
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

export const events: EngineModule = {
  id: 'events',
  phase: 'aftermath',
  cadence: 'monthly',
  reads: ['_authority.pendingSituations', 'events/*', 'world.date', 'era'],
  writes: ['_authority.pendingSituations', 'events/*'],
  collect(state, ctx: TickContext): DomainEffect[] {
    const tree = state as unknown as Tree
    const date = tree.world?.date ?? ''
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return []
    const year = Number(date.slice(0, 4))
    const iso = `${date}-01`
    const queue = tree._authority?.pendingSituations?.queue ?? {}
    const ledger = tree.events ?? { eventCD: {}, resolvedEvents: [] }

    // 队列卫生：过期条目出队（不点即过期 LL-05 —— 裁决权在玩家当月；过期后引擎清位，
    // ResolveRef 引用过期 key 由 resolves 侧报错 —— EVT-9 不投影替代）
    const effects: DomainEffect[] = []
    for (const s of Object.values(queue)) {
      if (s.expiresAt <= iso) effects.push({ op: 'situationDequeue', args: { key: s.key } })
    }

    // 队列已满：本月不抽取（先清过期 —— 过期项由 resolves/LL-05 裁决层处理，引擎只让位）
    const active = Object.values(queue).filter((s) => s.expiresAt > iso)
    if (active.length >= MAX_QUEUE) return effects

    // ① 候选过滤：年代门 + 冷却（台账真实月差）
    const themes = activeThemes(ctx.monthIndex, { year: 1921, month: 1 }) // EPOCH 1921-01
    const candidates: Candidate[] = []
    for (const def of eventTable) {
      if (!eraGate(def, year)) continue
      if (cooldownMonthsPassed(ledger.eventCD[def.id], ctx.monthIndex, { year: 1921, month: 1 }) < def.cooldownMonths) continue
      const boost = def.tags.some((t) => themes.has(t)) ? ATMOSPHERE_BOOST : 1
      candidates.push({ def, source: 'event', weight: def.weight * boost })
    }
    for (const def of situationTemplates) {
      if (!eraGate(def, year)) continue
      if (cooldownMonthsPassed(ledger.eventCD[def.id], ctx.monthIndex, { year: 1921, month: 1 }) < def.cooldownMonths) continue
      const boost = def.tags.some((t) => themes.has(t)) ? ATMOSPHERE_BOOST : 1
      candidates.push({ def, source: 'template', weight: def.weight * TEMPLATE_WEIGHT_FACTOR * boost })
    }
    if (candidates.length === 0) return effects.length > 0 ? effects : []

    // ② 加权抽取（rng 派生：模块 id + monthIndex + salt 'events' —— B-02）
    const rng = ctx.rng('events')
    const picked: Candidate[] = []
    const remaining = [...candidates] // 抽走即除名（同月不重复）
    const budget = Math.min(MAX_PER_MONTH, MAX_QUEUE - active.length)
    while (picked.length < budget && remaining.length > 0) {
      const total = remaining.reduce((s, c) => s + c.weight, 0)
      let roll = rng.next() * total
      let hit = remaining.length - 1
      for (let i = 0; i < remaining.length; i++) {
        roll -= remaining[i].weight
        if (roll <= 0) { hit = i; break }
      }
      const chosen = remaining.splice(hit, 1)[0]
      // 约束：模板侧 ≤1 —— 已有模板再抽中模板则弃（不重摇：抽样序即契约，弃位是确定性动作）
      if (chosen.source === 'template' && picked.filter((p) => p.source === 'template').length >= MAX_TEMPLATES_PER_MONTH) continue
      picked.push(chosen)
    }
    if (picked.length === 0) return effects.length > 0 ? effects : []

    // ③ 入队 ops：快照 payload（§8.6 —— 不依赖运行时定义表）+ 台账冷却更新
    const nextCD: Record<string, string> = { ...ledger.eventCD }
    for (const c of picked) {
      const key = `${c.def.id}#${ctx.monthIndex}`
      effects.push({
        op: 'situationEnqueue',
        args: {
          situation: {
            key,
            templateId: c.def.id,
            payload: {
              version: 1,
              title: c.def.title,
              desc: c.def.desc,
              options: c.def.options.map((o) => ({ text: o.text, effects: o.effects })),
              tags: c.def.tags,
            },
            arrivedAt: iso,
            expiresAt: isoPlusMonths(date, EXPIRY_MONTHS),
          },
        },
      })
      nextCD[c.def.id] = iso
    }
    effects.push({ op: 'eventsPost', args: { eventCD: nextCD, resolvedEvents: ledger.resolvedEvents } })
    return effects
  },
}
