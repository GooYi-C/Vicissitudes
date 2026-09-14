// src/validation/calendar.ts — 月序日历纯函数（L1；被 L2 temporal 与 L3 world 共用）
// monthIndex：1921-01 = 0（B-01 rng 派生与审计共用口径）。
export const EPOCH_YEAR = 1921
export const EPOCH_MONTH = 1 // 1921-01

export type GameYearMonth = string // YYYY-MM（canonical world.date 粒度 = 月）

export function monthIndexFrom(date: string): number {
  const [y, m] = date.split('-').map(Number)
  return (y - EPOCH_YEAR) * 12 + (m - EPOCH_MONTH)
}

export function dateFromMonthIndex(idx: number): string {
  const y = EPOCH_YEAR + Math.floor(idx / 12)
  const m = ((idx % 12) + 12) % 12 + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

// canonical 日期唯一推进（temporal 模块经此产出推进效果；M-03 行 world.date）
// 纯函数：同输入同输出，无 Date 依赖（B-02）
export function advanceMonth(date: string): string {
  return dateFromMonthIndex(monthIndexFrom(date) + 1)
}
