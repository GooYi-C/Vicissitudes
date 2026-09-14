// src/engine/temporal.ts — 模块 1：日期同步 + 货币按日期锚点演进（monthly）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：world.date、economy.currency（canonical 日期单点 —— 唯一推进者）
import type { EngineModule, TickContext } from './types'
import { advanceMonth, monthIndexFrom } from '../validation/calendar'
import type { DomainEffect } from '../validation/effects'

// 货币锚点（附录 E 数值事实源；标定五步的第一步 —— 初值，附复核点）
// monthIndex 口径：1921-01=0（EPOCH）→ 1939-01=216、1942-01=252、1949-12=348
const CURRENCY_ANCHORS: readonly { from: number; to: number; currency: string }[] = [
  { from: 0, to: 215, currency: 'yinyuan' }, // 1921-01 ~ 1938-12 银元
  { from: 216, to: 251, currency: 'fabi' }, // 1939-01 ~ 1941-12 法币（战时）
  { from: 252, to: 348, currency: 'jinquanyuan' }, // 1942-01 ~ 1949-12 金圆券末期
]

function currencyFor(monthIndex: number): string {
  for (const a of CURRENCY_ANCHORS) {
    if (monthIndex >= a.from && monthIndex <= a.to) return a.currency
  }
  return 'yinyuan'
}

export const temporal: EngineModule = {
  id: 'temporal',
  phase: 'simulation',
  cadence: 'monthly',
  reads: ['world.date', 'economy.currency'],
  writes: ['world.date', 'economy.currency'],
  collect(state, _ctx: TickContext): DomainEffect[] {
    void _ctx
    const date = (state as { world?: { date?: string } }).world?.date ?? ''
    if (!/^\d{4}-\d{2}$/.test(date)) return [] // 形状异常：不猜测（防呆；正常由 schema 守）
    const idx = monthIndexFrom(date)
    const next = advanceMonth(date)
    const currency = currencyFor(monthIndexFrom(next))
    const current = (state as { economy?: { currency?: string } }).economy?.currency
    const effects: DomainEffect[] = [{ op: 'advanceDate', args: { to: next } }]
    if (currency !== current) {
      effects.push({ op: 'setCurrency', args: { currency } })
    }
    void idx
    return effects
  },
}
