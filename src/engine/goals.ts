// src/engine/goals.ts — 模块 12：月度目标（monthly；aftermath 相位首位）
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：goals/*。E-2.5 九类目标池 + 数值带 + 二选一轮换奖励。
//
// 月度语义（E-2.5）：
//   每月 tick：上月目标先结算（达标 → done 标记；奖励发放走 modifyPlayer —— 二选一轮换制）
//   → 新月池生成（≤3 条；exhausted 剔除：控城类已完成则剔除）
//   → 目标数值带从玩家现状推导（存款目标 = 上月收入 ×6 —— 零收入开局用银带下限）
// 达标奖励：银元 = 月结余带 ×0.5 或 声望 +2（二选一，轮换制防刷 —— rewardCursor 交替）
// 数值三问：
// - 池深 3 条（E-2.5 未明言池深；设计：与「单轮处境 ≤2」同量级 —— 一眼可读的月清单）
// - 声望奖励 +2 / 银元奖励 = 月结余带 ×0.5（E-2.5 原文）
// - 上月收入口径 = |settlement.ledger 上月条目|（无上月条目 → 银带下限 5）

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree, Goal } from '../validation/tree'
import { advanceMonth } from '../validation/calendar'

const POOL_SIZE = 3
const GOAL_KINDS = ['profit', 'reputation', 'business', 'trade', 'forces', 'city', 'savings', 'informant', 'order'] as const

// 目标文案（九类 —— E-2.5 池名逐类对应）
const GOAL_TEXT: Record<Goal['kind'], (t: string) => string> = {
  profit: (t) => `本月结余达 ${t} 银元`,
  reputation: (t) => `声望提升 ${t} 点`,
  business: () => '新开或升级一处实业',
  trade: () => '新开一条商路或满趟运营',
  forces: (t) => `兵力扩充 ${t}%`,
  city: () => '推进控城事业',
  savings: (t) => `存款达到 ${t} 银元`,
  informant: () => '新布一个眼线',
  order: (t) => `所在城治安改善 ${t} 点`,
}

// 月度目标生成（rng 走 ctx.rng('goals') —— B-02：模块 id + monthIndex 派生，L2 不自造随机源）
function generateGoals(tree: Tree, rng: { int: (n: number) => number }, monthIndex: number): Goal[] {
  const kinds = [...GOAL_KINDS]
  // exhausted 剔除：无实业/无商路/无控城时对应类不出（免得月月挂着做不到的目标）
  const hasBusiness = Object.keys(tree.finance?.businesses ?? {}).length > 0
  const hasTrade = Object.keys(tree.trade?.routes ?? {}).length > 0
  const hasCity = Object.keys(tree.fiscal?.cities ?? {}).length > 0
  const eligible = kinds.filter((k) => {
    if (k === 'business') return hasBusiness
    if (k === 'trade') return hasTrade
    if (k === 'city') return hasCity
    return true
  })
  const pool: Goal[] = []
  while (pool.length < POOL_SIZE && eligible.length > 0) {
    const idx = rng.int(eligible.length)
    const kind = eligible.splice(idx, 1)[0]
    pool.push(makeGoal(kind, tree, monthIndex))
  }
  return pool
}

function makeGoal(kind: Goal['kind'], tree: Tree, monthIndex: number): Goal {
  const cursor = monthIndex % 2 // 轮换制（rewardCursor 月序奇偶交替 —— 确定性）
  const rewardKind: Goal['rewardKind'] = cursor === 0 ? 'money' : 'reputation'
  let target = 0
  let text = ''
  switch (kind) {
    case 'profit': {
      // 月结余带下沿（E-1.2 各身份 −5～+90；取银带中位 25 为通用下沿）
      target = 25
      text = GOAL_TEXT.profit(String(target))
      break
    }
    case 'reputation':
      target = 3
      text = GOAL_TEXT.reputation(String(target))
      break
    case 'forces':
      target = 10
      text = GOAL_TEXT.forces(String(target))
      break
    case 'savings': {
      // 上月收入 ×6（E-2.5 原文）；无上月条目 → 银带下限 5 ×6 = 30
      const last = tree.settlement?.ledger?.at(-1)
      const income = last ? Math.abs(last.amount) : 5
      target = Math.max(30, Math.round(income * 6))
      text = GOAL_TEXT.savings(String(target))
      break
    }
    case 'order':
      target = 5
      text = GOAL_TEXT.order(String(target))
      break
    default:
      text = GOAL_TEXT[kind]('')
  }
  return { id: `goal-${kind}-${monthIndex}`, kind, text, target, done: false, rewardKind }
}

export const goals: EngineModule = {
  id: 'goals',
  phase: 'aftermath',
  cadence: 'monthly',
  reads: ['goals/*', 'world.date', 'settlement/*', 'career'],
  writes: ['goals/*'],
  collect(state, ctx: TickContext): DomainEffect[] {
    void ctx
    const tree = state as unknown as Tree
    const date = tree.world?.date ?? ''
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return []
    const current = tree.goals
    const rng = ctx.rng('goals') // B-02：salt 稳定；抽样次序属契约

    // 首月：直接生成本月池（无上月目标可结算）
    if (current.pool.length === 0) {
      const monthIndex = ctx.monthIndex
      const pool = generateGoals(tree, rng, monthIndex)
      return [{ op: 'goalsPost', args: { goals: { month: date, pool, rewardCursor: current.rewardCursor } } }]
    }

    // 非首月：上月池结算（骨架口径 —— 达标判定接 career 域后实装；当前 done 恒保 false
    // 透传，新池生成）。奖励发放逻辑同随 career 接线（modifyPlayer 的奖励写入需玩家域在树）。
    const nextMonth = advanceMonth(date)
    const pool = generateGoals(tree, rng, ctx.monthIndex + 1)
    const rewardCursor = (current.rewardCursor + 1) % 2
    return [{ op: 'goalsPost', args: { goals: { month: nextMonth, pool, rewardCursor } } }]
  },
}
