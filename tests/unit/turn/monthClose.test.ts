// @vitest-environment happy-dom
// tests/unit/turn/monthClose.test.ts — VS-02 S-09 月关账（L4）＋ 判据⑦ 组合根顺序取证
//
// 失败判据覆盖（rebuild-v2.0/src/51-build-rings.md:164-193 九条中的第 ①②⑦ 条 + S-09 不变量 1/2）：
//   ① 月关账早于日结（S-08 不变量 1，**报错级** —— 断言必须失败于顺序违反注入）
//   ② 月关账后任一日 facts 数不减少（SAV-2 事实不灭，本批次最核心判据）
//   ⑦ 月初快照 = 提交前状态（S-11 不变量 1）—— 断言点住在组合根 `src/App.vue`（快照调用必须先于
//      tickWorld），故本文件末以 createApp 挂载取证（沿用 tests/unit/ui/llm-observation.test.ts 既有夹具法，
//      不引入 @vue/test-utils 依赖；不新增测试文件、不外扩写面）。
//      首行 happy-dom 指令为本文件统一环境：纯函数用例无 DOM 依赖，与挂载用例互不影响。
// 附：S-09 只压 narrative（facts 原样透传）/ 月志 ~200 字与有损标注 / pastDigest 预算档 1200/1800/2400 / 重放幂等
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App as VueApp } from 'vue'
import App from '../../../src/App.vue'
import { listAutoSaves, readSave } from '../../../src/stores/saves'
import { loadSettings, saveSettings } from '../../../src/stores/settings'
import {
  closeMonth,
  assertDayCloseFirst,
  PAST_DIGEST_BUDGETS,
  MONTH_TEXT_TARGET,
  type DayLogView,
  type MonthLogView,
} from '../../../src/turn/monthClose'

const day = (date: string, facts: unknown[], narrative: string, kind?: 'transit'): DayLogView => ({
  date,
  facts,
  narrative,
  turnRange: [1, 1],
  ...(kind ? { kind } : {}),
})

/** 逐月关账（真实编排序：先有该月 DayLog 才有月关账），返回滚动后的 pastDigest 与丢弃计数 */
function roll(tier: keyof typeof PAST_DIGEST_BUDGETS, months: number, dayNarrative = '甲'.repeat(200)) {
  let pastDigest = ''
  let monthLogs: MonthLogView[] = []
  let dayLogs: DayLogView[] = []
  let dropped = 0
  for (let i = 1; i <= months; i++) {
    const m = `1921-${String(i).padStart(2, '0')}`
    dayLogs = [...dayLogs, day(`${m}-01`, [], dayNarrative)]
    const r = closeMonth({ month: m, dayLogs, monthLogs, pastDigest, budgetChars: PAST_DIGEST_BUDGETS[tier] })
    monthLogs = r.monthLogs
    pastDigest = r.pastDigest
    dropped += r.droppedEntries
  }
  return { pastDigest, monthLogs, dayLogs, dropped }
}

describe('VS-02 判据① S-08 不变量 1：日结先于月关账（报错级，不静默补偿）', () => {
  it('顺序违反注入 → 抛错（月无 DayLog）；正确顺序 → 不抛（对照证明断言指向顺序而非恒抛）', () => {
    expect(() => closeMonth({ month: '1921-07', dayLogs: [], monthLogs: [], pastDigest: '' })).toThrow(
      /S-08 不变量 1 违反：月关账先于日结/,
    )
    expect(() =>
      closeMonth({ month: '1921-07', dayLogs: [day('1921-07-01', [], '本月平静。')], monthLogs: [], pastDigest: '' }),
    ).not.toThrow()
  })

  it('DayLog 悬空月外（月志在档但其日结不在）→ 抛错；该月自己缺日结与「别人的月志缺日结」分别报错', () => {
    expect(() =>
      closeMonth({ month: '1921-08', dayLogs: [day('1921-08-01', [], '本月平静。')], monthLogs: [{ month: '1921-07', text: '旧志' }], pastDigest: '' }),
    ).toThrow(/DayLog 悬空月外/)
    expect(() => assertDayCloseFirst('1921-09', [], [])).toThrow(/S-08 不变量 1 违反/)
    expect(() => assertDayCloseFirst('1921-09', [day('1921-09-01', [], 'x')], [])).not.toThrow()
  })

  it('顺序违反不产生任何副作用：抛错路径下 monthLogs/pastDigest 不被返回（无半写产物）', () => {
    let caught: unknown = null
    try {
      closeMonth({ month: '1921-07', dayLogs: [day('1921-06-01', [], 'x')], monthLogs: [], pastDigest: '【1921-05】旧' })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toMatch(/月关账先于日结/)
  })
})

describe('VS-02 判据② SAV-2 事实不灭：月关账只压 narrative，facts 逐条不变（本批最核心）', () => {
  it('压缩确实发生（truncated）的前提下，dayLogs 逐字节原样透传、任一日 facts 条数不减', () => {
    const factsA = [
      { kind: 'deal', amount: 12, counterparty: '', what: '茶' },
      { kind: 'situation', id: 'evt-a' },
    ]
    const factsB = [{ kind: 'move', from: '1921-07-01', to: '1921-08-01' }]
    const logs: DayLogView[] = [
      day('1921-07-01', factsA, '长'.repeat(300)),
      day('1921-07-01', factsB, '第二段'.repeat(80), 'transit'),
    ]
    const before = JSON.stringify(logs)
    const r = closeMonth({ month: '1921-07', dayLogs: logs, monthLogs: [], pastDigest: '' })

    expect(r.truncated).toBe(true) // 前提：本用例真的发生了叙事压缩，否则「facts 不变」可能恒真
    expect(JSON.stringify(r.dayLogs)).toBe(before) // 逐字节（不重建、不裁剪、不排序）
    for (const [i, log] of r.dayLogs.entries()) {
      expect(log.facts).toEqual(logs[i].facts)
      expect(log.facts.length).toBe(logs[i].facts.length)
    }
    expect(r.dayLogs.flatMap((d) => d.facts)).toHaveLength(3)
  })

  it('月志生成不跨界写 facts：返回对象里 facts 与输入同一引用（无复制改写路径）', () => {
    const logs = [day('1921-07-01', [{ kind: 'note', text: '底账' }], '叙事')]
    const r = closeMonth({ month: '1921-07', dayLogs: logs, monthLogs: [], pastDigest: '' })
    expect(r.dayLogs[0]).toBe(logs[0])
    expect(r.dayLogs[0].facts[0]).toBe(logs[0].facts[0])
  })
})

describe('VS-02 S-09 月志：日叙串联压缩（目标 ~200 字）＋有损边界如实标注', () => {
  it('超 MONTH_TEXT_TARGET → 截断到目标长度并置 truncated（不假装无损）', () => {
    const r = closeMonth({
      month: '1921-07',
      dayLogs: [day('1921-07-01', [], '甲'.repeat(150)), day('1921-07-02', [], '乙'.repeat(150))],
      monthLogs: [],
      pastDigest: '',
    })
    expect(r.text.length).toBe(MONTH_TEXT_TARGET + 1)
    expect(r.text.endsWith('…')).toBe(true)
    expect(r.truncated).toBe(true)
  })

  it('未超限 → 原样串联（零增删），truncated=false', () => {
    const r = closeMonth({
      month: '1921-07',
      dayLogs: [day('1921-07-01', [], '第一日'), day('1921-07-02', [], '第二日')],
      monthLogs: [],
      pastDigest: '',
    })
    expect(r.text).toBe('第一日；第二日')
    expect(r.truncated).toBe(false)
  })

  it('全空月 → 月志为一行「本月平静。」（不因压缩丢掉「这个月无事」这个事实）', () => {
    const r = closeMonth({
      month: '1921-07',
      dayLogs: [day('1921-07-01', [], '本月平静。'), day('1921-07-02', [], '本月平静。')],
      monthLogs: [],
      pastDigest: '',
    })
    expect(r.text).toBe('本月平静。')
    expect(r.monthLogs).toEqual([{ month: '1921-07', text: '本月平静。' }])
  })

  it('空日叙述可注入（与 dayClose 同文契约由调用点守），注入后不参与正文串联（只留一行事实）', () => {
    const r = closeMonth({
      month: '1921-07',
      dayLogs: [day('1921-07-01', [], '空日占位'), day('1921-07-02', [], '真事')],
      monthLogs: [],
      pastDigest: '',
      emptyDayNarrative: '空日占位',
    })
    expect(r.text).toBe('真事')
  })
})

describe('VS-02 S-09 不变量 2：pastDigest 滚动与预算档 1200/1800/2400', () => {
  it('预算档数字 = S-09 原表（thrifty 1200 / standard 1800 / full 2400）', () => {
    expect(PAST_DIGEST_BUDGETS).toEqual({ thrifty: 1200, standard: 1800, full: 2400 })
  })

  it('超预算从最旧丢起：thrifty 7 个月丢 2 条、full 同 7 个月一条不丢（证明丢弃由预算档决定）', () => {
    const thrifty = roll('thrifty', 7)
    expect(thrifty.dropped).toBe(2)
    expect(thrifty.pastDigest.length).toBeLessThanOrEqual(PAST_DIGEST_BUDGETS.thrifty)
    expect(thrifty.pastDigest).toContain('【1921-07】') // 最新月必在
    expect(thrifty.pastDigest).not.toContain('【1921-01】') // 最旧已被丢
    expect(thrifty.pastDigest).toContain('【1921-03】') // 丢到 03 为止（丢 01/02）

    const full = roll('full', 7)
    expect(full.dropped).toBe(0)
    expect(full.pastDigest).toContain('【1921-01】')
    expect(full.pastDigest.length).toBeLessThanOrEqual(PAST_DIGEST_BUDGETS.full)
    expect(PAST_DIGEST_BUDGETS.full).toBeGreaterThan(PAST_DIGEST_BUDGETS.thrifty)
  })

  it('pastDigest 格式：按月分条、条目形如 【YYYY-MM】月志', () => {
    const r = roll('standard', 3)
    const entries = r.pastDigest.split('\n')
    expect(entries).toHaveLength(3)
    expect(entries[0]).toMatch(/^【1921-01】/)
    expect(entries[2]).toMatch(/^【1921-03】/)
  })

  it('未给 budgetChars → 取最低档 1200（缺省不越权放大预算）', () => {
    let pastDigest = ''
    let monthLogs: MonthLogView[] = []
    let dayLogs: DayLogView[] = []
    for (let i = 1; i <= 7; i++) {
      const m = `1921-${String(i).padStart(2, '0')}`
      dayLogs = [...dayLogs, day(`${m}-01`, [], '甲'.repeat(200))]
      const r = closeMonth({ month: m, dayLogs, monthLogs, pastDigest })
      pastDigest = r.pastDigest
      monthLogs = r.monthLogs
    }
    expect(pastDigest.length).toBeLessThanOrEqual(PAST_DIGEST_BUDGETS.thrifty)
    expect(pastDigest).not.toContain('【1921-01】')
  })
})

describe('VS-02 重放幂等（S-07 同存档重放）', () => {
  it('同月关账两次：monthLogs 不产生重复月志，pastDigest 不重复条目（逐字节一致）', () => {
    const logs = [day('1921-07-01', [{ kind: 'note', text: 'x' }], '七月之事')]
    const once = closeMonth({ month: '1921-07', dayLogs: logs, monthLogs: [], pastDigest: '' })
    const twice = closeMonth({ month: '1921-07', dayLogs: logs, monthLogs: once.monthLogs, pastDigest: once.pastDigest })
    expect(twice.monthLogs).toEqual(once.monthLogs)
    expect(twice.pastDigest).toBe(once.pastDigest)
    expect(twice.pastDigest.split('\n')).toHaveLength(1)
  })

  it('连续两月关账（真实序）：monthLogs 按月追加、不覆盖旧月', () => {
    const july = [day('1921-07-01', [], '七月')]
    const aug = [...july, day('1921-08-01', [], '八月')]
    const m1 = closeMonth({ month: '1921-07', dayLogs: july, monthLogs: [], pastDigest: '' })
    const m2 = closeMonth({ month: '1921-08', dayLogs: aug, monthLogs: m1.monthLogs, pastDigest: m1.pastDigest })
    expect(m2.monthLogs.map((m) => m.month)).toEqual(['1921-07', '1921-08'])
    expect(m2.monthLogs[0].text).toBe('七月')
    expect(m2.pastDigest.split('\n')).toHaveLength(2)
  })
})

// ── 判据⑦ S-11 不变量 1：月初快照必须是**提交前**状态（组合根顺序）──────────────────
// 反面对照（可失败性）：若实现把 snapshotMonthStart 挪到 tickWorld 之后，则档内 world.date 会是
// 过月后的月份、dayLogs 已含本回合日结 —— 本用例两条断言必失败（注入验证见
// docs/acceptance-vs02.md §3 判据⑦）。
vi.mock('../../../src/components/OpeningDossier.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      emits: ['start'],
      setup(_props, { emit }) {
        return () =>
          h(
            'button',
            { 'data-testid': 'fixture-start', onClick: () => emit('start', 'era-warlord', 'student') },
            '测试开局',
          )
      },
    }),
  }
})

describe('VS-02 判据⑦ S-11 不变量 1：月初快照 = 提交前状态（组合根顺序）', () => {
  let app: VueApp | undefined
  let host: HTMLDivElement
  const fetchMock = vi.fn(async () => {
    throw new Error('免 API 路径不得发起网络调用')
  })

  beforeEach(async () => {
    localStorage.clear()
    vi.stubGlobal('fetch', fetchMock)
    host = document.createElement('div')
    document.body.appendChild(host)
    const { settings } = await loadSettings()
    settings.upstream = { baseUrl: '', model: '', apiKey: '' } // 免 API：onAction 走现行过月（零 LLM）
    await saveSettings(settings)
  })
  afterEach(() => {
    app?.unmount()
    app = undefined
    host.remove()
    vi.unstubAllGlobals()
    fetchMock.mockClear()
  })

  async function mountAndStart() {
    app = createApp(App)
    app.mount(host)
    await nextTick()
    ;(host.querySelector('[data-testid="fixture-start"]') as HTMLButtonElement).click()
    await vi.waitFor(async () => expect(await readSave('auto-current')).not.toBeNull())
  }

  function submit(text = '过月（免 API，零调用）') {
    const input = host.querySelector('input[aria-label="行动输入"]') as HTMLInputElement
    input.value = text
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }

  it('首回合：auto-1921-07 档 = 提交前状态；当前档已过月到 1921-08 且本回合日结落账', async () => {
    await mountAndStart()
    submit()
    await vi.waitFor(async () => {
      expect((await listAutoSaves()).some((s) => s.slotId === 'auto-1921-07')).toBe(true)
    })
    const pre = (await listAutoSaves()).find((s) => s.slotId === 'auto-1921-07')
    if (!pre) throw new Error('未写入 auto-1921-07 快照')
    expect(pre.variables.world.date).toBe('1921-07') // 提交前（过月后树已是 1921-08）
    expect(pre.dayLogs).toHaveLength(0) // 快照先于 closeDay：本回合日结不在快照里

    await vi.waitFor(async () => {
      expect((await readSave('auto-current'))?.variables.world.date).toBe('1921-08')
    })
    const cur = await readSave('auto-current')
    expect(cur?.dayLogs).toHaveLength(1) // S-08 ④：零效果也落一条（该回合关闭 1921-07）
    expect(cur?.dayLogs[0].date).toBe('1921-07-01')
    expect(cur?.monthLogs.map((m) => m.month)).toEqual(['1921-07']) // S-08 顺序：日结先、月关账后
    expect(fetchMock).not.toHaveBeenCalled() // BIL-3 零调用地板
  })
})
