// src/turn/compiler.ts — DomainEffect 编译契约（§十九 B-07）
// EXEMPT:LAYER-004 见 §十六 L-07 豁免表（turn 管线两半组合，2026-09-15 登记）
// 受限指令集：效果携带「意图」，不携带状态树路径知识 —— 路径由编译层映射。
// Operation = RFC 6902 JSON Patch（add/remove/replace）；单一编译器：玩家命令与叙事者意图同路（LL-08）。
// 编译函数签名不含来源参数（LL-08 不变量 2 —— 等价性的结构保证）。

import type { Tree } from '../validation/tree'
import type { CommandInput, DomainEffect, Operation } from '../validation/effects'

// 受限指令集与 Operation 的类型面住 L1 effects.ts（被 L2/L4/L5/L6 共用 —— SK-05 层间修正留痕）
export type { DomainEffect, DomainOp, JsonPatchOp, Operation, CommandInput } from '../validation/effects'

// ── 指令 → 路径映射（唯一事实源；模型永不直接产出 Operation）────────
function cityPath(state: Readonly<Tree>, cityId: string, dim: string): string {
  // 六维落 map/<city>/<dim>（M-03 行 map/*；当前城市由 args.cityId 显式携带）
  void state
  return `/map/${cityId}/${dim}`
}

const DIMS = new Set(['economy', 'security', 'culture', 'transport', 'industry', 'population'])

export function compile(effects: readonly DomainEffect[], state: Readonly<Tree>): Operation[] {
  const ops: Operation[] = []
  for (const eff of effects) {
    switch (eff.op) {
      case 'cityEffect': {
        const cityId = str(eff.args.cityId, 'cityEffect.cityId')
        const dim = str(eff.args.dim, 'cityEffect.dim')
        if (!DIMS.has(dim)) throw new CompileError(`cityEffect: 未知维度 ${dim}（六维封闭枚举）`)
        const delta = num(eff.args.delta, 'cityEffect.delta')
        const current = readPath(state, cityPath(state, cityId, dim))
        // base 语义：树内现值优先；无现值（首月播种 / map 未建键）用显式 base；
        // 两者皆无 → 0 起步（add 语义：replace 缺键自动落 add —— applyPatch record 规则）
        const base = typeof current === 'number' ? current : typeof eff.args.base === 'number' && Number.isFinite(eff.args.base) ? eff.args.base : 0
        const next = clamp(base + delta, 0, 100) // 六维底数 ∈ [0,100]（L0-04 同口径）
        ops.push({ op: 'replace', path: `/map/${cityId}/${dim}`, value: next })
        break
      }
      case 'setCurrency': {
        const currency = str(eff.args.currency, 'setCurrency.currency')
        ops.push({ op: 'replace', path: '/economy/currency', value: currency })
        break
      }
      case 'advanceDate': {
        const to = str(eff.args.to, 'advanceDate.to')
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(to)) throw new CompileError(`advanceDate: 日期格式 ${to}（YYYY-MM）`)
        ops.push({ op: 'replace', path: '/world/date', value: to }) // canonical 单点（M-03）
        break
      }
      case 'memoryWrite': {
        const item = eff.args.item
        if (!item || typeof item !== 'object') throw new CompileError('memoryWrite: item 必须为对象')
        const id = str((item as Record<string, unknown>).id, 'memoryWrite.item.id')
        ops.push({ op: 'add', path: `/memory/items/${id}`, value: item })
        ops.push({ op: 'add', path: `/memory/order/-`, value: id }) // 追加序（append-only）
        break
      }
      case 'situationEnqueue': {
        const sit = eff.args.situation
        if (!sit || typeof sit !== 'object') throw new CompileError('situationEnqueue: situation 必须为对象')
        const key = str((sit as Record<string, unknown>).key, 'situationEnqueue.situation.key')
        // queue 键 = situation key 原样（record 键位；'#' 合法 —— 不做 URL 编码：
        // 编入/出队两侧同口径，直接以 key 寻址 = B-09-2 精确命中通道）
        ops.push({ op: 'add', path: `/_authority/pendingSituations/queue/${key}`, value: sit })
        break
      }
      case 'situationDequeue': {
        const key = str(eff.args.key, 'situationDequeue.key')
        ops.push({ op: 'remove', path: `/_authority/pendingSituations/queue/${key}` })
        break
      }
      case 'claimTerritory': {
        const polityId = str(eff.args.polityId, 'claimTerritory.polityId')
        const controller = str(eff.args.controller, 'claimTerritory.controller')
        const interval = eff.args.interval
        if (!interval || typeof interval !== 'object') throw new CompileError('claimTerritory: interval 必须为对象')
        // 链①：三写者一通道 —— 同一编译路径，史实不是特权公民（M-03）
        ops.push({
          op: 'add',
          path: `/_authority/territoryControl/claims/-`,
          value: { polityId, controller, interval },
        })
        break
      }
      case 'modifyPlayer': {
        const field = str(eff.args.field, 'modifyPlayer.field')
        if (!/^[a-zA-Z]+$/.test(field)) throw new CompileError(`modifyPlayer: 字段名 ${field} 非法`)
        const value = eff.args.value
        ops.push({ op: 'replace', path: `/career/${field}`, value })
        break
      }
      case 'marketPublish': {
        // B-03：market 唯一发布 —— 整份行情表一次落账（engine-exclusive 域，不经 sanitize）
        const quotes = eff.args.quotes
        if (!quotes || typeof quotes !== 'object') throw new CompileError('marketPublish: quotes 必须为对象')
        for (const [id, q] of Object.entries(quotes as Record<string, unknown>)) {
          const quote = q as { price?: unknown; trend?: unknown }
          if (typeof quote?.price !== 'number' || !Number.isFinite(quote.price) || quote.price < 0) {
            throw new CompileError(`marketPublish: 商品 ${id} price 非法（须为非负有限数）`)
          }
          if (typeof quote?.trend !== 'number' || !Number.isFinite(quote.trend)) {
            throw new CompileError(`marketPublish: 商品 ${id} trend 非法（须为有限数）`)
          }
          ops.push({ op: 'replace', path: `/economy/commodities/${encodeURIComponent(id)}`, value: { price: quote.price, trend: quote.trend } })
        }
        break
      }
      case 'routeSet': {
        // §9.3 路线落账：整条路线对象原样写 trade/routes/{id}（状态机 + saturation 落账）
        const route = eff.args.route
        if (!route || typeof route !== 'object') throw new CompileError('routeSet: route 必须为对象')
        const id = str((route as Record<string, unknown>).id, 'routeSet.route.id')
        ops.push({ op: 'replace', path: `/trade/routes/${encodeURIComponent(id)}`, value: route })
        break
      }
      case 'settlementPost': {
        // E-1.2：现金过账 + 流水 append（cash 为玩家账本唯一现金口径）
        const month = str(eff.args.month, 'settlementPost.month')
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new CompileError(`settlementPost: 月份格式 ${month}（YYYY-MM）`)
        const amount = num(eff.args.amount, 'settlementPost.amount')
        const what = str(eff.args.what, 'settlementPost.what')
        const cash = eff.args.cash
        if (typeof cash !== 'number' || !Number.isFinite(cash)) throw new CompileError('settlementPost: cash（过账后余额）必须为有限数字')
        ops.push({ op: 'replace', path: '/settlement/cash', value: cash })
        ops.push({ op: 'add', path: '/settlement/ledger/-', value: { month, amount, what } })
        break
      }
      case 'financePost': {
        // E-1.4：实业经营落账（businesses 全量替换 + loyalty）
        const businesses = eff.args.businesses
        if (!businesses || typeof businesses !== 'object') throw new CompileError('financePost: businesses 必须为对象')
        const loyalty = eff.args.loyalty
        if (typeof loyalty !== 'number' || !Number.isFinite(loyalty)) throw new CompileError('financePost: loyalty 必须为数字')
        ops.push({ op: 'replace', path: '/finance/businesses', value: businesses })
        ops.push({ op: 'replace', path: '/finance/loyalty', value: Math.min(100, Math.max(0, loyalty)) })
        break
      }
      case 'fiscalPost': {
        // E-1.4：控城财政落账（cities 全量替换）
        const cities = eff.args.cities
        if (!cities || typeof cities !== 'object') throw new CompileError('fiscalPost: cities 必须为对象')
        ops.push({ op: 'replace', path: '/fiscal/cities', value: cities })
        break
      }
      case 'setSeasonal': {
        // §9.2 分工：worldtick 只落季节参数（month/grainFactor）；改价权在 market
        const month = num(eff.args.month, 'setSeasonal.month')
        const grainFactor = num(eff.args.grainFactor, 'setSeasonal.grainFactor')
        if (!Number.isInteger(month) || month < 1 || month > 12) throw new CompileError(`setSeasonal: month 非法 ${month}（1–12）`)
        if (grainFactor < 0.5 || grainFactor > 2) throw new CompileError(`setSeasonal: grainFactor 非法 ${grainFactor}（[0.5, 2]）`)
        ops.push({ op: 'replace', path: '/seasonal', value: { month, grainFactor } })
        break
      }
      case 'citySeed': {
        // 首月播种：城市六维整体落账（CityDims 全量 —— 逐维中间态进不了树形状）
        const cityId = str(eff.args.cityId, 'citySeed.cityId')
        const dims = eff.args.dims
        if (!dims || typeof dims !== 'object') throw new CompileError('citySeed: dims 必须为对象')
        for (const k of DIMS) {
          const v = (dims as Record<string, unknown>)[k]
          if (typeof v !== 'number' || !Number.isFinite(v)) throw new CompileError(`citySeed: dims.${k} 必须为数字`)
        }
        ops.push({ op: 'add', path: `/map/${cityId}`, value: dims })
        break
      }
      case 'eventsPost': {
        // §8.3 台账落账：eventCD 冷却表（全量替换）+ resolvedEvents（追加序）
        const eventCD = eff.args.eventCD
        if (!eventCD || typeof eventCD !== 'object') throw new CompileError('eventsPost: eventCD 必须为对象')
        const resolved = eff.args.resolvedEvents
        if (!Array.isArray(resolved)) throw new CompileError('eventsPost: resolvedEvents 必须为数组')
        for (const v of Object.values(eventCD as Record<string, unknown>)) {
          if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new CompileError('eventsPost: eventCD 值必须为 ISO 日期')
        }
        ops.push({ op: 'replace', path: '/events/eventCD', value: eventCD })
        ops.push({ op: 'replace', path: '/events/resolvedEvents', value: resolved })
        break
      }
      case 'goalsPost': {
        // E-2.5 月度目标池落账（月切换全量替换）
        const goals = eff.args.goals
        if (!goals || typeof goals !== 'object') throw new CompileError('goalsPost: goals 必须为对象')
        const month = str((goals as Record<string, unknown>).month, 'goalsPost.goals.month')
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new CompileError(`goalsPost: 月份格式 ${month}`)
        ops.push({ op: 'replace', path: '/goals', value: goals })
        break
      }
      case 'forcesPost': {
        // E-3.1：势力兵力落账（factions 独占；全量替换）
        const strength = eff.args.strength
        if (!strength || typeof strength !== 'object') throw new CompileError('forcesPost: strength 必须为对象')
        for (const v of Object.values(strength as Record<string, unknown>)) {
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new CompileError('forcesPost: 兵力必须为非负整数')
        }
        ops.push({ op: 'replace', path: '/forces/strength', value: strength })
        break
      }
      case 'warPost': {
        // E-3.2：war/ 台账落账（预警 + contested —— 撤离窗口数据源）
        const war = eff.args.war
        if (!war || typeof war !== 'object') throw new CompileError('warPost: war 必须为对象')
        ops.push({ op: 'replace', path: '/war', value: war })
        break
      }
      case 'timelinePost': {
        // history 游标推进（lastCursor —— 半开区间 (lastCursor, now] 的左端）
        const lastCursor = str(eff.args.lastCursor, 'timelinePost.lastCursor')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(lastCursor)) throw new CompileError(`timelinePost: lastCursor 格式 ${lastCursor}（ISO）`)
        ops.push({ op: 'replace', path: '/timeline/lastCursor', value: lastCursor })
        break
      }
      case 'intelPost': {
        // 情报观察表落账（Scout 命令写入 / intelligence 衰减 —— 全量替换）
        const observations = eff.args.observations
        if (!Array.isArray(observations)) throw new CompileError('intelPost: observations 必须为数组')
        ops.push({ op: 'replace', path: '/_authority/intelligenceObservations/observations', value: observations })
        break
      }
      case 'memoryMaintain': {
        // 链③-1 管家月度维护：items 元数据（pinned/archived/importance 衰减）+ order 索引
        // content 不可改（append-only）：维护只动元数据；order 随载荷（追加序时序面）
        const items = eff.args.items
        if (!items || typeof items !== 'object') throw new CompileError('memoryMaintain: items 必须为对象')
        const order = eff.args.order
        if (!Array.isArray(order)) throw new CompileError('memoryMaintain: order 必须为数组')
        ops.push({ op: 'replace', path: '/memory/items', value: items })
        ops.push({ op: 'replace', path: '/memory/order', value: order })
        break
      }
      case 'laborPost': {
        // R4：劳动力投影落账（幂等纯投影——全量替换；_computed 是引擎独占域不进 sanitize）
        const labor = eff.args.labor
        if (!labor || typeof labor !== 'object') throw new CompileError('laborPost: labor 必须为对象')
        ops.push({ op: 'replace', path: '/_computed/labor', value: labor })
        break
      }
      case 'relationsPost': {
        // R4：人脉档落账（交叉一致维护——全量替换）
        const persons = eff.args.persons
        if (!persons || typeof persons !== 'object') throw new CompileError('relationsPost: persons 必须为对象')
        ops.push({ op: 'replace', path: '/relations/persons', value: persons })
        break
      }
      case 'crisisPost': {
        // R4：危机台账落账（只落账不触发——触发经 crisisToPendingSituation 适配载荷走 B-07）
        const records = eff.args.records
        if (!records || typeof records !== 'object') throw new CompileError('crisisPost: records 必须为对象')
        ops.push({ op: 'replace', path: '/crisis/records', value: records })
        break
      }
      default: {
        // 穷尽性检查：未知 op 抛错（不静默跳过 —— B-07 错误语义）
        const exhausted: never = eff.op
        throw new CompileError(`未知 DomainOp: ${String(exhausted)}（受限指令集封闭，扩展见 SX-03）`)
      }
    }
  }
  return ops
}

export function compileCommand(input: CommandInput, state: Readonly<Tree>): DomainEffect[] {
  // SK-04 命令种子：命令名 → DomainEffect（完整命令集在 SK-06/R 环扩）
  switch (input.cmd) {
    case 'Travel':
      return [{ op: 'advanceDate', args: { to: input.args.to } }]
    case 'startGame': {
      const vars = input.args.variables as Tree | undefined
      if (!vars) throw new CompileError('startGame: 缺 variables')
      void state
      return [{ op: 'advanceDate', args: { to: vars.world.date } }]
    }
    default:
      throw new CompileError(`未知命令: ${input.cmd}（命令登记见 SX-06）`)
  }
}

// ── 工具 ──────────────────────────────────────────────────────────
export class CompileError extends Error {}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new CompileError(`${name} 必须为非空字符串`)
  return v
}
function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new CompileError(`${name} 必须为有限数字`)
  return v
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
function readPath(state: Readonly<Tree>, path: string): unknown {
  let cur: unknown = state
  for (const seg of path.split('/').filter(Boolean)) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg]
    } else return undefined
  }
  return cur
}
