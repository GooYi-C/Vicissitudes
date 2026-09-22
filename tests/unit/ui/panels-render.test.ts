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
  const versions = {}
  const panels = [
    ['目标', GoalsPanel], ['史册', HistoryPanel], ['情报', IntelPanel], ['记忆', MemoryPanel],
    ['报夹', PressPanel], ['人脉', RelationsPanel], ['世界', WorldPanel],
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
})
