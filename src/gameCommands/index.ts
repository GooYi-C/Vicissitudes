// src/gameCommands/index.ts — 命令种子（L5；SK-04）
// 完整命令集（Occupation/Scout/Railway 等）在 R3/SK-06 扩（SX-06 配方：一命令一文件）。
// 命令层纯函数：(输入, state) → DomainEffect[]，不读 store、不发请求、不看时钟。

import type { CommandInput, DomainEffect } from '../turn/compiler'
import { compileCommand } from '../turn/compiler'
import type { Tree } from '../validation/tree'
import { initialTree } from '../validation/tree'
import type { GameDate } from '../validation/tree'

export interface GameCommandResult {
  effects: DomainEffect[]
}

// startGame：开局命令 —— era 一次写入此后只读（M-03）；产出初始树供存档层
export function startGame(params: {
  eraId: string
  identityId: string
  date: GameDate
}): { effects: DomainEffect[]; variables: Tree } {
  const variables = initialTree(params.eraId, params.date)
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
