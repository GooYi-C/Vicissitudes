// tests/unit/data/era-start.test.ts — 项目 2：时代开局月（REBUILD.md:326 / :367 / :5857）
// 目的：五时代各有自己的开局日，且与 fromYear/startMonth 一致；App.vue 不再写死 '1921-07'。
import { describe, expect, it } from 'vitest'
import { eras, eraStartDate, eraStartDateById } from '../../../src/data/eras'
import { EraSchema } from '../../../src/validation/dataSchemas'
import { monthIndexFrom, advanceMonth } from '../../../src/validation/calendar'

describe('L0-01 时代开局月（startMonth）', () => {
  it('五条 era 全部携带合法 startMonth（1-12）', () => {
    expect(eras).toHaveLength(5)
    for (const e of eras) {
      expect(e.startMonth).toBeGreaterThanOrEqual(1)
      expect(e.startMonth).toBeLessThanOrEqual(12)
      expect(Number.isInteger(e.startMonth)).toBe(true)
    }
  })

  it('startMonth 在 EraSchema.parse 后不被剥离（Zod 未知键会丢）', () => {
    const parsed = EraSchema.parse({ id: 'era-test', name: 'x', fromYear: 1930, toYear: 1931, startMonth: 9, desc: 'd' })
    expect(parsed.startMonth).toBe(9)
  })

  it('startMonth 缺省即解析失败（不得靠默认值蒙混 —— 宁可报错不猜测）', () => {
    const r = EraSchema.safeParse({ id: 'era-test', name: 'x', fromYear: 1930, toYear: 1931, desc: 'd' })
    expect(r.success).toBe(false)
  })

  it('五时代开局日 = fromYear + startMonth，且 eraStartDateById 与之一致', () => {
    for (const e of eras) {
      const expected = `${e.fromYear}-${String(e.startMonth).padStart(2, '0')}`
      expect(eraStartDate(e)).toBe(expected)
      expect(eraStartDateById(e.id)).toBe(expected)
    }
  })

  it('era-warlord 仍为 1921-07（保持既有硬编码行为不变，与时间线 tl-192107-founding 对齐）', () => {
    expect(eraStartDateById('era-warlord')).toBe('1921-07')
  })

  it('五时代开局日互不相同（相邻时代开局月差异非空 —— 直接对应 assertions.json:538）', () => {
    const byYear = [...eras].sort((a, b) => a.fromYear - b.fromYear)
    const dates = byYear.map((e) => eraStartDate(e))
    expect(new Set(dates).size).toBe(dates.length)
    // 且严格递增（时代首尾相接 + 开局月落在各自年份内 ⇒ 月序必然递增）
    const idx = dates.map((d) => monthIndexFrom(d))
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1])
  })

  it('各时代从自己的开局日推 12 个月，均不越出该时代年份区间的下一年', () => {
    for (const e of eras) {
      let d = eraStartDateById(e.id)
      for (let i = 0; i < 12; i++) d = advanceMonth(d)
      // 推进 12 次后应到达开局月 + 12（年为 fromYear+1 或更晚）
      expect(monthIndexFrom(d)).toBe(monthIndexFrom(eraStartDate(e)) + 12)
    }
  })

  it('未知 era id 抛错（不静默回落到 1921-07）', () => {
    expect(() => eraStartDateById('era-nonexistent')).toThrowError(/未知时代 id/)
  })

  it('各时代开局月落在其 fromYear 自然年内（startMonth 不越界到别年）', () => {
    for (const e of eras) {
      expect(eraStartDate(e).slice(0, 4)).toBe(String(e.fromYear))
    }
  })
})
