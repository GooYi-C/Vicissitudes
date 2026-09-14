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
        const base = typeof current === 'number' ? current : num(eff.args.base, 'cityEffect.base')
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
        ops.push({ op: 'add', path: `/_authority/pendingSituations/queue/${encodeURIComponent(key)}`, value: sit })
        break
      }
      case 'situationDequeue': {
        const key = str(eff.args.key, 'situationDequeue.key')
        ops.push({ op: 'remove', path: `/_authority/pendingSituations/queue/${encodeURIComponent(key)}` })
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
