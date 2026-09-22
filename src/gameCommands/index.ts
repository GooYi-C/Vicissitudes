// src/gameCommands/index.ts — 命令种子（L5；SK-04）
// 完整命令集（Occupation/Scout/Railway 等）在 R3/SK-06 扩（SX-06 配方：一命令一文件）。
// 命令层纯函数：(输入, state) → DomainEffect[]，不读 store、不发请求、不看时钟。

import type { CommandInput, DomainEffect } from '../validation/effects'
import { compileCommand } from '../turn/compiler'
import type { Tree } from '../validation/tree'
import { initialTree, OpeningSetupSchema } from '../validation/tree'
import type { OpeningSetup, GameDate } from '../validation/tree'
import { identities } from '../data/identities'

export interface GameCommandResult {
  effects: DomainEffect[]
}

/** 开局参数不成立（时代与身份不匹配／身份不存在）—— 拒绝开局，不猜默认身份。 */
export class StartGameError extends Error {}

/**
 * 开局设定解析（LAUNCH-01）：把「时代 + 身份 + 开局日」解析成写入树的开局设定。
 * 身份必须属于该时代（L0-02 是 5 era × 8 identity 的 40 行表），否则抛错 ——
 * 此处是「宁可 unassigned 报错，不猜测」的开局面落点（原先丢弃 identityId、
 * 树内不记身份，导致刷新恢复后出身与开局城一并丢失）。
 */
export function resolveOpeningSetup(params: { eraId: string; identityId: string }): OpeningSetup {
  const row = identities.find((i) => i.id === params.identityId)
  if (!row) throw new StartGameError(`未知身份 ${params.identityId}（身份表 L0-02 无此行）`)
  if (row.eraId !== params.eraId) {
    throw new StartGameError(`身份 ${row.id} 属于 ${row.eraId}，与所选时代 ${params.eraId} 不匹配`)
  }
  return OpeningSetupSchema.parse({
    identity: { id: row.id, kind: row.kind, startCity: row.startCity },
    startMoney: row.startMoney,
    startsWithControl: row.startsWithControl,
  })
}

// startGame：开局命令 —— era/identity 一次写入此后只读（M-03）；产出初始树供存档层
export function startGame(params: {
  eraId: string
  identityId: string
  date: GameDate
}): { effects: DomainEffect[]; variables: Tree } {
  const opening = resolveOpeningSetup({ eraId: params.eraId, identityId: params.identityId })
  const variables = initialTree(params.eraId, params.date, opening)
  return {
    effects: [{ op: 'advanceDate', args: { to: params.date } }],
    variables,
  }
}

// Travel：出行命令 —— advanceDate（M-03 行 world.date 的命令侧写者）
export function travel(to: GameDate, _state: Readonly<Tree>): GameCommandResult {
  void _state
  return { effects: [{ op: 'advanceDate', args: { to } }] }
}

// 通用入口（ChoiceInput / 意图识别器消费；与模型意图走同一 compileCommand —— LL-08）
export function runCommand(input: CommandInput, state: Readonly<Tree>): DomainEffect[] {
  return compileCommand(input, state)
}

export { compileCommand }
