// src/turn/TurnRunner.ts — 原子提交（§十九 B-06）
// EXEMPT:LAYER-004 见 §十六 L-07 豁免表（turn 管线两半组合，2026-09-15 登记）
// 职责四件（承 §5.4/§3.2 第4层）：汇总单次提交 / 单次 world tick / 原子回滚 / 域版本 bump。
// 全或无：任一 op 非法 → 整批丢弃 + 世界零变更；唯一提交点（L2/L5/L6 只能产出）。
// B-10：提交成功后按实际写入域通知 store 层（bump 定义在 §二十二 U-02，此处只发通知）。

import type { Operation, JsonPatchOp, DomainEffect } from './compiler'
import { compile } from './compiler'
import type { Tree } from '../validation/tree'
import { TreeSchema } from '../validation/tree'

// ── RFC 6902 应用器（纯函数；返回新树，失败返回 null —— 不改原树）────
export function applyPatch(state: Readonly<Tree>, ops: readonly Operation[]): Tree | null {
  // 深拷贝后逐 op 应用；任一失败 → 返回 null（调用方丢弃整批）
  let draft: unknown = structuredClone(state)
  for (const op of ops) {
    try {
      draft = applyOne(draft, op)
    } catch {
      return null
    }
  }
  // 应用后仍须是合法树（形状守住：不合法 → 整批否决）
  const parsed = TreeSchema.safeParse(draft)
  return parsed.success ? parsed.data : null
}

function applyOne(draft: unknown, op: JsonPatchOp): unknown {
  const segs = op.path.split('/').filter(Boolean)
  if (segs.length === 0) throw new Error('empty path')
  const walk = (node: unknown, i: number): unknown => {
    const seg = segs[i]
    if (Array.isArray(node)) {
      const idx = seg === '-' ? node.length : Number(seg)
      if (!Number.isInteger(idx)) throw new Error(`bad index ${seg}`)
      if (op.op === 'replace') {
        const copy = [...node]
        copy[idx] = (op as { value: unknown }).value
        return copy
      }
      if (op.op === 'add') {
        const copy = [...node]
        copy.splice(idx, 0, (op as { value: unknown }).value)
        return copy
      }
      const copy = [...node]
      copy.splice(idx, 1)
      return copy
    }
    if (node && typeof node === 'object') {
      const rec = { ...(node as Record<string, unknown>) }
      if (op.op === 'remove') {
        if (!(seg in rec)) throw new Error(`missing key ${seg}`)
        delete rec[seg]
        return rec
      }
      if (op.op === 'add' || op.op === 'replace') {
        if (op.op === 'replace' && !(seg in rec)) throw new Error(`missing key ${seg}`)
        rec[seg] = (op as { value: unknown }).value
        return rec
      }
    }
    throw new Error(`unreachable at ${segs.join('/')}`)
  }
  // 逐段重建（不可变更新）
  const rebuild = (node: unknown, i: number): unknown => {
    if (i === segs.length - 1) return walk(node, i)
    const seg = segs[i]
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const rec = { ...(node as Record<string, unknown>) }
      rec[seg] = rebuild((rec as Record<string, unknown>)[seg], i + 1)
      return rec
    }
    if (Array.isArray(node)) {
      const idx = Number(seg)
      const copy = [...node]
      copy[idx] = rebuild(copy[idx], i + 1)
      return copy
    }
    throw new Error(`path break at ${segs.slice(0, i + 1).join('/')}`)
  }
  return rebuild(draft, 0)
}

// ── 域归属判定（M-03 写域登记表投影：op path 首两段 → 域键）──────────
export function domainOfPath(path: string): string {
  const segs = path.split('/').filter(Boolean)
  if (segs.length === 0) return ''
  if (segs[0] === '_authority') return `_authority.${segs[1] ?? ''}` // authority 三根按子域分
  if (segs.length >= 2) return `${segs[0]}.${segs[1]}`
  return segs[0]
}

export interface CommitResult {
  ok: boolean
  state: Readonly<Tree> // 成功 = 新树；失败 = 原树（世界零变更）
  writtenDomains: string[] // 实际写入域集合（B-10 通知内容；失败 = []）
  error?: string
}

export class TurnRunner {
  private committed = false // 提交次数上限 1（B-06 不变量 3）
  private lastCommittedState: Readonly<Tree> | null = null
  private bumpHandler: ((domains: readonly string[]) => void) | null = null

  /** U-02/B-10 接缝：提交成功后按实际写入域通知（域版本号本体与 bump 在 L7 stores） */
  onCommit(handler: (domains: readonly string[]) => void): void {
    this.bumpHandler = handler
  }

  /** 原子提交：effects → compile → apply → 校验 → 通知。任一步失败整批丢弃。 */
  commit(effects: readonly DomainEffect[], state: Readonly<Tree>): CommitResult {
    if (this.committed) {
      // B-06 不变量 5：已提交批次不得追加（追加 = 新回合）。拒绝时返回**已提交后**的世界，
      // 不是调用方手里的旧引用（否则调用方会误以为第一次提交被回滚）。
      const current = this.lastCommittedState ?? state
      return { ok: false, state: current, writtenDomains: [], error: '一次回合只允许一次提交（B-06 不变量 3）' }
    }
    let ops: Operation[]
    try {
      ops = compile(effects, state) // 编译纯函数（B-07 不变量 5）
    } catch (e) {
      return { ok: false, state, writtenDomains: [], error: `编译失败：${(e as Error).message}` }
    }
    const next = applyPatch(state, ops)
    if (next === null) {
      // 原子回滚：世界零变更，不 bump（BUS-6）
      return { ok: false, state, writtenDomains: [], error: '批内存在非法 op —— 整批丢弃（原子回滚）' }
    }
    this.committed = true
    this.lastCommittedState = next
    // 实际写入域集合（去重，按首次出现序 —— B-10 不变量 2：不是全都 bump）
    const domains: string[] = []
    for (const op of ops) {
      const d = domainOfPath(op.path)
      if (d && !domains.includes(d)) domains.push(d)
    }
    this.bumpHandler?.(domains) // 只在提交成功后通知（U-02 不变量 1）
    return { ok: true, state: next, writtenDomains: domains }
  }

  /** 供测试/回放：重置回合提交标记（一次回合一个实例；重放 = 新实例） */
  resetForTest(): void {
    this.committed = false
    this.lastCommittedState = null
  }
}

// 同输入两次运行逐位一致（SK-04 出口判据）—— 序列化比较用确定性键序（L1 纯函数）
import { stableStringify } from '../validation/stableJson'
export function sameWorld(a: Readonly<Tree>, b: Readonly<Tree>): boolean {
  return stableStringify(a) === stableStringify(b)
}
