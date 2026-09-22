// @vitest-environment happy-dom
// UI-6 / SK-07 门 2：十一面板的「渲染层」回归 —— 面板 v-for 必须绑到迭代函数的**返回值**。
//
// 背景：骨架期 7 个面板写成 `v-for="g in goals"`（函数引用，缺 `()`）。Vue 的 renderList
// 只认 Array/string/number/object，函数落空集 → 面板恒空但 500+ 项测试全绿（面板层零断言）。
// 本文件挂真实面板 + 真实 selector + 真实 tree，锁死「数据进得去、li 出得来」。
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, type App as VueApp } from 'vue'
import { initialTree, type Tree } from '../../../src/validation/tree'
import {
  goalsList,
  memoryBook,
  relationsList,
  timelineView,
} from '../../../src/stores/selectors'
import { evaluate } from '../../../src/stores/selectors/runtime'
import GoalsPanel from '../../../src/components/panels/GoalsPanel.vue'
import HistoryPanel from '../../../src/components/panels/HistoryPanel.vue'
import IntelPanel from '../../../src/components/panels/IntelPanel.vue'
import MemoryPanel from '../../../src/components/panels/MemoryPanel.vue'
import PressPanel from '../../../src/components/panels/PressPanel.vue'
import RelationsPanel from '../../../src/components/panels/RelationsPanel.vue'
import WorldPanel from '../../../src/components/panels/WorldPanel.vue'
import FinancePanel from '../../../src/components/panels/FinancePanel.vue'
import StatusPanel from '../../../src/components/panels/StatusPanel.vue'
import CareerPanel from '../../../src/components/panels/CareerPanel.vue'
import MapPanel from '../../../src/components/panels/MapPanel.vue'

// 种子上限与内容表规模无关：这是「渲染是否发生」的最小证据，不是内容量断言。
const SEED = {
  goals: 2,
  situations: 2,
  observations: 2,
  memory: 2,
}

function seededTree(): Tree {
  const tree = initialTree('era-warlord', '1921-07')
  tree.goals.pool = [
    { id: 'g1', kind: 'profit', text: '首月盈利三成', target: 30, done: false, rewardKind: 'money' },
    { id: 'g2', kind: 'reputation', text: '结交一位报界故人', target: 1, done: true, rewardKind: 'reputation' },
  ]
  tree._authority.pendingSituations.queue = {
    'sit-a': { key: 'sit-a', templateId: 'evt-a', payload: {}, arrivedAt: '1921-07-05', expiresAt: '1921-08-05' },
    'sit-b': { key: 'sit-b', templateId: 'evt-b', payload: {}, arrivedAt: '1921-07-20', expiresAt: '1921-08-20' },
  }
  tree._authority.intelligenceObservations.observations = [
    { id: 'ob-1', regionId: 'vic.beijing', level: 2, observedAt: '1921-07-01', expiresAt: '1922-01-01' },
    { id: 'ob-2', regionId: 'vic.shanghai', level: 1, observedAt: '1921-07-01', expiresAt: '1922-01-01' },
  ]
  tree.memory.items = {
    m1: { id: 'm1', type: 'person', title: '沈砚秋', content: '报馆旧识，欠我一个人情。', importance: 5, pinned: false, archived: false, people: ['p1'], monthIndex: 0, createdAt: '1921-07-02', source: 'engine' },
    m2: { id: 'm2', type: 'place', title: '十六铺码头', content: '货栈盘查忽然紧了。', importance: 4, pinned: false, archived: false, people: [], monthIndex: 0, createdAt: '1921-07-18', source: 'engine' },
  }
  tree.memory.order = ['m1', 'm2']
  tree.relations.persons = {
    p1: { id: 'p1', status: 'alive', tier: 2, propagated: false },
    p2: { id: 'p2', status: 'alive', tier: 1, propagated: false },
  }
  return tree
}

let app: VueApp | undefined
let host: HTMLDivElement

function mountAll(tree: Tree): void {
  // 重复挂载时先卸掉上一个实例（否则旧 app 仍挂在 host 上，查询命中旧 DOM ——
  // selector memo 以「同 state 对象」为键，改完树再挂必须换 state 或重挂）
  app?.unmount()
  app = undefined
  host?.remove()
  const versions = {}
  const panels = [
    ['目标', GoalsPanel], ['史册', HistoryPanel], ['情报', IntelPanel], ['记忆', MemoryPanel],
    ['报夹', PressPanel], ['人脉', RelationsPanel], ['世界', WorldPanel],
    ['账本', FinancePanel], ['状态', StatusPanel], ['生涯', CareerPanel], ['地图', MapPanel],
  ] as const
  const Wrap = { setup: () => () => h('div', panels.map(([, C]) => h(C, { state: tree, versions }))) }
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(Wrap)
  app.mount(host)
}

afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
})

// 面板根 <section aria-label> 与其下的顶层 <ul> 一一对应；li 只由 v-for 产出。
function listItems(label: string): HTMLLIElement[] {
  const section = host.querySelector(`section[aria-label="${label}"]`)
  expect(section, `面板 ${label} 未挂载`).not.toBeNull()
  return [...section!.querySelectorAll('ul > li')] as HTMLLIElement[]
}

function texts(label: string): string[] {
  return listItems(label).map((li) => li.textContent!.replace(/\s+/g, ' ').trim())
}

// 账本/状态面板：一个 section 下有多张表，用 <ul aria-label> / <dl> 定位（不用 listItems
// 的「section 下所有 ul > li」口径，否则几张表会串在一起）。
function labelledItems(label: string): HTMLLIElement[] {
  const list = host.querySelector(`ul[aria-label="${label}"]`)
  if (!list) return []
  return [...list.querySelectorAll(':scope > li')] as HTMLLIElement[]
}

function labelTexts(label: string): string[] {
  return labelledItems(label).map((li) => li.textContent!.replace(/\s+/g, ' ').trim())
}

// 状态面板是 <dl class="vic-kv">：dt/dd 成对读成 Record
function kvPairs(label: string): Record<string, string> {
  const section = host.querySelector(`section[aria-label="${label}"]`)
  expect(section, `面板 ${label} 未挂载`).not.toBeNull()
  const out: Record<string, string> = {}
  const children = [...section!.querySelectorAll('dt, dd')]
  for (let i = 0; i + 1 < children.length; i += 2) {
    out[children[i]!.textContent!.trim()] = children[i + 1]!.textContent!.replace(/\s+/g, ' ').trim()
  }
  return out
}

// 账本面板用：种入现金流水 / 实业 / 控城税收，且带上真实树内 identity 与生涯数值
function seededFinanceTree(): Tree {
  const tree = initialTree('era-warlord', '1921-07')
  tree.settlement.cash = 845.96
  tree.settlement.ledger = [
    { month: '1921-08', amount: -12.4, what: '佣工月钱' },
    { month: '1921-09', amount: 84.6, what: '财政净入' },
  ]
  tree.finance.businesses = {
    'biz-teahouse@wuhan': { bizId: 'biz-teahouse', cityId: 'wuhan', level: 1, capital: 200, lastProfit: 9.5 },
  }
  tree.fiscal.cities = {
    wuhan: { cityId: 'wuhan', taxBase: 150, militarySpend: 10, adminSpend: 5, lastRevenue: 84.58 },
  }
  tree.career.money = 12
  tree.career.reputation = 50
  return tree
}

describe('十一面板渲染层（v-for 绑定迭代函数返回值）', () => {
  it('目标面板渲染当月目标池（每项一个 li，不重复不遗漏）', () => {
    const tree = seededTree()
    expect(evaluate(goalsList, tree, {})).toHaveLength(SEED.goals)
    mountAll(tree)
    expect(listItems('目标')).toHaveLength(SEED.goals)
    expect(texts('目标')).toEqual(['首月盈利三成', '结交一位报界故人'])
  })

  it('世界面板渲染待决处境队列（附 templateId 与 key）', () => {
    const tree = seededTree()
    mountAll(tree)
    expect(listItems('世界')).toHaveLength(SEED.situations)
    expect(texts('世界')[0]).toContain('evt-a')
    expect(texts('世界')[0]).toContain('sit-a')
  })

  it('情报面板渲染观察记录（region · 迷雾 L）', () => {
    const tree = seededTree()
    mountAll(tree)
    expect(listItems('情报')).toHaveLength(SEED.observations)
    expect(texts('情报')).toContain('vic.beijing · 迷雾 L2')
  })

  it('报夹面板渲染 L0 史实报名（非空，且含申报）', () => {
    const tree = seededTree()
    mountAll(tree)
    const items = texts('报夹')
    expect(items.length).toBeGreaterThanOrEqual(5)
    expect(items.join('|')).toContain('申报')
  })

  it('记忆面板按 order 渲染、不重复（order 是权威时序面）', () => {
    const tree = seededTree()
    expect(evaluate(memoryBook, tree, {}).items).toHaveLength(SEED.memory)
    mountAll(tree)
    expect(listItems('记忆')).toHaveLength(SEED.memory)
    expect(texts('记忆')).toEqual(['沈砚秋', '十六铺码头'])
  })

  it('人脉面板渲染 persons；显示名回查记忆簿 people 引用，查不到退回 id', () => {
    const tree = seededTree()
    expect(evaluate(relationsList, tree, {})).toHaveLength(2)
    mountAll(tree)
    expect(listItems('人脉')).toHaveLength(2)
    expect(texts('人脉').sort()).toEqual(['p2', '沈砚秋'])
  })

  it('史册面板渲染 L0-08 时间线，且不泄露开局月之后的节点', () => {
    const tree = seededTree()
    const entries = evaluate(timelineView, tree, {})
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.date <= '1921-07-99')).toBe(true)
    mountAll(tree)
    expect(listItems('史册')).toHaveLength(entries.length)
    expect(texts('史册')[0]).toContain('中共建党')
  })

  it('空域渲染为空列表（不是「渲染了函数」也不是抛错）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    tree._authority.pendingSituations.queue = {}
    tree._authority.intelligenceObservations.observations = []
    mountAll(tree)
    expect(listItems('世界')).toHaveLength(0)
    expect(listItems('情报')).toHaveLength(0)
    expect(listItems('记忆')).toHaveLength(0)
    expect(listItems('目标')).toHaveLength(0)
  })

  // ── 账本 / 状态面板：2026-09-23 从 v-if="false" 接通真实数据 ──────────────
  // 这两个面板骨架期写的是 v-if="false"，且 FinancePanel 还叠着「迭代函数缺 ()」的同款缺陷
  // （`sheets.income` 少写括号 → undefined.length）。下面把「数据进得去、li 出得来」锁死。
  it('账本面板渲染流水与资产（现金计入资产，负债明标未接通）', () => {
    const tree = seededFinanceTree()
    mountAll(tree)
    const flows = labelledItems('账本流水')
    expect(flows).toHaveLength(2)
    expect(flows[0].textContent).toContain('1921-08')
    expect(flows[0].textContent).toContain('佣工月钱')
    expect(labelTexts('账本资产')).toHaveLength(2)
    expect(labelTexts('账本资产')[0]).toContain('845.96')
    // 负债无数据源 → 不渲染 li，改为明标（不编造数值凑三件套）
    expect(labelledItems('账本负债')).toHaveLength(0)
    expect(host.querySelector('section[aria-label="账本"]')!.textContent).toContain('负债：借贷域未接通')
  })

  it('状态面板渲染日期/现金/声望档位/健康；声望显示档位名而非点数', () => {
    const tree = seededFinanceTree()
    mountAll(tree)
    const kv = kvPairs('状态')
    expect(kv['日期']).toBe('1921-07')
    expect(kv['现金']).toBe('845.96 yinyuan')
    expect(kv['随身']).toBe('12 元')
    expect(kv['声望']).toBe('扬名（50）')
    expect(kv['健康']).toBe('无恙（100）')
  })

  it('状态面板健康档位按 E-0.2 阈值（60 轻伤 / 30 重伤 / ≤0 死亡线）', () => {
    // 每次换一个**新建** tree：selector memo 键是「域版本号 + state 对象」，
    // 就地改同一棵树的字段而不 bump 版本号时 memo 会返回旧值（生产侧由 U-02 的
    // bumpDomains 保证版本号跟着走；本测试不模拟版本号，故按用例新建树）。
    for (const [health, label] of [[45, '轻伤（45）'], [10, '重伤（10）'], [0, '死亡线（0）']] as const) {
      const tree = initialTree('era-warlord', '1921-07')
      tree.career.health = health
      mountAll(tree)
      expect(kvPairs('状态')['健康']).toBe(label)
    }
  })

  it('状态面板出身取树内 identity；旧档 identity=null 显示「未选」', () => {
    const tree = initialTree('era-warlord', '1921-07')
    mountAll(tree)
    expect(kvPairs('状态')['出身']).toBe('未选')
    app?.unmount()
    const seeded = initialTree('era-warlord', '1921-07', {
      identity: { id: 'id-warlord-soldier', kind: 'soldier', startCity: 'wuhan' },
      startMoney: 0,
      startsWithControl: true,
    })
    mountAll(seeded)
    expect(kvPairs('状态')['出身']).toBe('soldier（wuhan）')
  })

  // ── UI-6 十一面板全覆盖：CareerPanel 与 MapPanel（挂起壳）此前不在本文件内 ──
  it('生涯面板渲染身家/声望/健康（随身现银口径 = career.money）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    tree.career.money = 23
    tree.career.reputation = 7
    mountAll(tree)
    const kv = kvPairs('生涯')
    expect(kv['身家']).toBe('23 银元')
    expect(kv['声望']).toBe('7')
    expect(kv['健康']).toBe('100')
  })

  it('十一面板全部挂载：注册表成员一个不缺（含挂起的地图壳）', () => {
    mountAll(seededTree())
    for (const label of ['生涯', '世界', '人脉', '记忆', '报夹', '账本', '状态', '目标', '情报', '史册', '地图']) {
      expect(host.querySelector(`section[aria-label="${label}"]`), `面板 ${label} 未挂载`).not.toBeNull()
    }
    // 地图位是挂起壳：明示挂起、不假装有数据
    expect(host.querySelector('section[aria-label="地图"]')!.textContent).toContain('整体挂起')
  })
})
