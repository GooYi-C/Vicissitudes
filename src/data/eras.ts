// src/data/eras.ts — L0-01 时代表（5 条；fromYear 升序首尾相接，五段并集 = [1921,1949]）
import type { Era } from '../validation/dataSchemas'
import { EraSchema } from '../validation/dataSchemas'

// startMonth = 该时代的**开局月**（1-12），世界开局日 = `${fromYear}-${startMonth}`。
// 依据：REBUILD.md:326「玩家从哪个时代开局，世界就从哪年哪月开始推演」；
//       REBUILD.md:367 第 4 条「时代表与时间线不得漂移：每条『开局那天的世界』
//       = 时间线在该日期的状态查询」；REBUILD.md:5857「五时代开局日各推 12 月」。
// 取值口径：**史实锚定 + 时间线对齐**（逐条理由见下方行内注）。
// 注意（REBUILD.md:331）：era 字段运行时只读，本字段仅在开局命令中被读一次用于定日，
// 运行时行为一律由 world.date 推导——不得在引擎内按 era 分支（factions.ts:98 /
// market.ts:105 两处既有分支是另一笔已登记的偏差）。
export const eras: readonly Era[] = Object.freeze([
  // 1921-07：与时间线 tl-192107-founding（1921-07-01）对齐，并保持既有硬编码开局月不变
  { id: 'era-warlord', name: '军阀混战', fromYear: 1921, toYear: 1927, startMonth: 7, desc: '直奉交替，北洋末路' },
  // 1928-01：定都南京（1927-04 宁汉分裂后、1928 年形式上统一全国）之岁首
  { id: 'era-nanjing', name: '宁汉对峙', fromYear: 1928, toYear: 1936, startMonth: 1, desc: '定都南京，建设与围剿并行' },
  // 1937-07：七七事变 / 全面抗战爆发月
  { id: 'era-resistance', name: '全面抗战', fromYear: 1937, toYear: 1944, startMonth: 7, desc: '烽火连天，山河破碎' },
  // 1945-01：1945-08 日本投降，开局处于抗战末段，年内即可驶入胜利与内战转折
  { id: 'era-civilwar', name: '内战风云', fromYear: 1945, toYear: 1948, startMonth: 1, desc: '胜利之后，暗流汹涌' },
  // 1949-01：金圆券崩溃（1948-08-19 起）与三大战役收尾之年，年内驶向改旗易帜
  { id: 'era-collapse', name: '大厦将倾', fromYear: 1949, toYear: 1949, startMonth: 1, desc: '金圆券崩，江山易帜' },
].map((e) => EraSchema.parse(e)))

/** 五时代的开局日（`YYYY-MM`）= fromYear + startMonth。
 *  注：此处**不 import L1 的 calendar**（§十六 L-01：L0 数据文件仅可 import dataSchemas，
 *  见 LAYER-007）。两个月的零填充不值得为它扩豁免表，故就地成串；L0 自洽。
 *  调用方若要推进月份，用 L1 `advanceMonth(eraStartDateById(id))`。 */
export function eraStartDate(era: Pick<Era, 'fromYear' | 'startMonth'>): string {
  return `${era.fromYear}-${String(era.startMonth).padStart(2, '0')}`
}

/**
 * 按 era id 解析开局日；未知 id 抛错。
 * 这是**开局命令的唯一取日入口**：调用方不得再写死 `'1921-07'` 之类字面量。
 */
export function eraStartDateById(eraId: string): string {
  const era = eras.find((e) => e.id === eraId)
  if (!era) throw new Error(`未知时代 id：${eraId}（时代表见 L0-01，共 ${eras.length} 条）`)
  return eraStartDate(era)
}
