// src/turn/monthClose.ts — S-09 月关账（L4：当月日叙串联压缩为月志 → pastDigest 滚动）
//
// 不变量（S-09）：只压 narrative，从不碰 facts（本文件对 dayLogs 只读进参、原样透传 —— 无任何写路径）；
// 有损边界如实标注（truncated / droppedEntries 计数返回，不假装无损）。
// 错误语义（S-09）：降级 —— 压不出月志则保留日叙原文（本函数抛错时调用方保留既有 dayLogs/monthLogs）。
// 错误语义（S-08 不变量 1）：**报错** —— 顺序违反（月关账先于日结）即抛，不做静默补偿。
//
// 层向纪律（同 dayClose.ts）：本文件自包含（零 import）—— 不在 LAYER_EXEMPT 双端点名单内，
// 与 dayClose.ts / monthRunner.ts 的任何 L4→L4 import 都会被 graph-check L-02 与 lint 拦下。
// 故 DayLog/MonthLog 形状在此二次本地同构声明（结构等值由调用点 TS 结构类型守住）。
//
// 月关账/年关账边界口径（SK-05 注释预告的校准，见 monthRunner.ts）：
// 月关账 = 每月一次（本文件）；年关账 = 12 月（full 管线，仍由 monthRunner.isTerminalMonth('-12') 判定）。

export const MONTH_TEXT_TARGET = 200 // 月志目标长度（S-09：~200 字）

// 往事记要预算档（S-09 不变量 2：1200/1800/2400 字符）——档名与 stores/settings.ts 的
// promptBudget 枚举同构（thrifty/standard/full）；L4 不引 L7，故此处本地声明映射。
export const PAST_DIGEST_BUDGETS = { thrifty: 1200, standard: 1800, full: 2400 } as const
export type PastDigestTier = keyof typeof PAST_DIGEST_BUDGETS

export interface MonthLogView { month: string; text: string }
export interface DayLogView {
  date: string
  facts: readonly unknown[]
  narrative: string
  turnRange: readonly [number, number]
  kind?: 'transit'
}

export interface MonthCloseInput {
  readonly month: string // 被关账的月 YYYY-MM（其日结必须先完成）
  readonly dayLogs: readonly DayLogView[]
  readonly monthLogs: readonly MonthLogView[]
  readonly pastDigest: string
  readonly budgetChars?: number // 缺省 = 最低档 1200
  readonly emptyDayNarrative?: string // 空日规则日叙（与 dayClose 同文；默认「本月平静。」）
}

export interface MonthCloseResult {
  readonly monthLogs: MonthLogView[]
  readonly pastDigest: string
  readonly text: string // 本月月志
  readonly truncated: boolean // 有损：日叙被截断
  readonly droppedEntries: number // 有损：往事记要滚动丢弃的旧月数
  readonly dayLogs: readonly DayLogView[] // 原样透传（facts 零触碰 —— S-09 不变量 1 的结构保证）
}

const ENTRY_SEP = '\n'
const DAY_SEP = '；'
const DEFAULT_EMPTY_DAY = '本月平静。'

/**
 * S-08 不变量 1 顺序锁死（报错级）：月关账不得早于日结。
 * 违反 = 该月无任何 DayLog（月志缺尾日），或既有月志的月份已无日结在档（DayLog 悬空月外）。
 */
export function assertDayCloseFirst(
  month: string,
  dayLogs: readonly { date: string }[],
  monthLogs: readonly MonthLogView[],
): void {
  const hasMonth = (m: string): boolean => dayLogs.some((d) => d.date.startsWith(`${m}-`))
  if (!hasMonth(month)) {
    throw new Error(
      `S-08 不变量 1 违反：月关账先于日结 —— 月 ${month} 无任何 DayLog（月志缺尾日）。` +
        '顺序锁死：先 closeDay（日结）后 closeMonth（月关账）。',
    )
  }
  for (const log of monthLogs) {
    if (!hasMonth(log.month)) {
      throw new Error(
        `S-08 不变量 1 违反：DayLog 悬空月外 —— 月志 ${log.month} 在档但其日结不存在（日结先于月关账）。`,
      )
    }
  }
}

/**
 * 月关账：当日日叙 → 串联压缩为月志（零 LLM 规则拼接，超 MONTH_TEXT_TARGET 截断并如实标注）
 * → pastDigest 滚动（append + 超预算丢最旧）。facts 不参与压缩，dayLogs 原样透传。
 */
export function closeMonth(input: MonthCloseInput): MonthCloseResult {
  assertDayCloseFirst(input.month, input.dayLogs, input.monthLogs)

  const empty = input.emptyDayNarrative ?? DEFAULT_EMPTY_DAY
  const monthDays = input.dayLogs.filter((d) => d.date.startsWith(`${input.month}-`))
  const narratives = monthDays.map((d) => d.narrative).filter((t) => t.length > 0)
  const substantive = narratives.filter((t) => t !== empty)

  let text: string
  let truncated = false
  if (substantive.length === 0) {
    text = empty // 全空月：月志即一行（不因压缩丢「本月平静」这一事实）
  } else {
    const joined = substantive.join(DAY_SEP)
    if (joined.length > MONTH_TEXT_TARGET) {
      text = `${joined.slice(0, MONTH_TEXT_TARGET)}…`
      truncated = true
    } else {
      text = joined
    }
  }

  // 同月幂等：已存在同月月志则替换（重放不产生重复月志）
  const withoutMonth = input.monthLogs.filter((m) => m.month !== input.month)
  const monthLogs: MonthLogView[] = [...withoutMonth, { month: input.month, text }]

  // pastDigest 滚动：同月重放不重复（先剔同月旧条，S-07 同存档重放语义）→ 附录新条 → 超预算从最旧丢起
  const budget = input.budgetChars ?? PAST_DIGEST_BUDGETS.thrifty
  const previous = input.pastDigest.length > 0 ? input.pastDigest.split(ENTRY_SEP).filter((e) => e.length > 0) : []
  const entries = previous.filter((e) => !e.startsWith(`【${input.month}】`))
  entries.push(`【${input.month}】${text}`)
  let droppedEntries = 0
  while (entries.join(ENTRY_SEP).length > budget && entries.length > 1) {
    entries.shift()
    droppedEntries += 1
  }

  return {
    monthLogs,
    pastDigest: entries.join(ENTRY_SEP),
    text,
    truncated,
    droppedEntries,
    dayLogs: input.dayLogs, // 原样（引号实证：不重建、不裁剪、不排序）
  }
}
