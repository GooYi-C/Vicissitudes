// src/parser/authorize.ts — capability 授权（§二十 LL-03）
// EXEMPT:LAYER-005 见 §十六 L-07 豁免表（parser 意图链三段组合，2026-09-15 登记）
// capability 按 'narrator' 固定签发；engine/debug 永不下发到客户端请求路径。
// 模型自报 actor 无效 —— 构造期不读取（进入 authorize 前已被 blocks/请求层剥离）。
// commandSet 由 LL-01 开放范围生成，不手写第二份白名单。

import type { Block } from './blocks'

// LL-01 命令意图开放范围（承 §6.3，原样列举不扩不缩）
export const NARRATOR_COMMAND_SET = [
  'Travel',
  'Business',
  'Trade',
  'Railway',
  'Scout',
  'Fiscal',
] as const

// 不在开放集合内（Pointer/City 等保持关闭）；系统流程模型不可触发
const SYSTEM_COMMANDS = new Set(['startGame', 'startPrologue'])
// 唯一例外（提议门）：Occupation 可叙事、开战必须玩家 UI 确认（LL-09 —— 入队不走本层放行）
export const PROPOSAL_GATE_COMMANDS = new Set(['Occupation'])

export type Actor = 'narrator' | 'engine' | 'debug'

export interface Capability {
  actor: 'narrator' // 字面量类型：只能是叙事者
  commandSet: readonly string[]
  patchOpsPerTurn: number
  memoryOpsPerTurn: 3 // 承 §6.3/§6.4
}

export function narratorCapability(): Capability {
  return {
    actor: 'narrator',
    commandSet: NARRATOR_COMMAND_SET,
    patchOpsPerTurn: 8, // 单轮补丁上限初值（T1 路径白名单 + 幅度之外的第三道闸）
    memoryOpsPerTurn: 3,
  }
}

export type AuthorizeResult =
  | { ok: true; block: Block }
  | { ok: false; block: Block; code: 'rejected'; detail: string }

export function authorize(block: Block, cap: Capability): AuthorizeResult {
  // 拒绝不抛异常：返回拒绝结果 + 诊断（回合继续 —— LL-03 错误语义「降级」）
  if (block.tag === 'Command') {
    const cmd = (block.payload as { cmd?: unknown }).cmd
    if (typeof cmd !== 'string' || cmd.length === 0) {
      return { ok: false, block, code: 'rejected', detail: 'Command 块缺 cmd 字段' }
    }
    if (SYSTEM_COMMANDS.has(cmd)) {
      return { ok: false, block, code: 'rejected', detail: `系统流程命令 ${cmd} 模型不可触发（LL-01）` }
    }
    if (PROPOSAL_GATE_COMMANDS.has(cmd)) {
      return { ok: false, block, code: 'rejected', detail: `Occupation 走提议门（LL-09）：必须玩家 UI 确认` }
    }
    if (!cap.commandSet.includes(cmd)) {
      return { ok: false, block, code: 'rejected', detail: `命令 ${cmd} 不在开放集合（LL-01 表）` }
    }
    return { ok: true, block }
  }
  // 叙事正文（无机制效果）不经本层（LL-01 不变量 3：① 与 ⑦ 例外）
  if (block.tag === 'UpdateVariable' || block.tag === 'JSONPatch' || block.tag === 'Resolve' || block.tag === 'Propose' || block.tag === 'Intervene') {
    return { ok: true, block }
  }
  return { ok: false, block, code: 'rejected', detail: '未知块类别' }
}

// LLM-15 行为断言用：自报 actor 字段被剥离 —— authorize 的输入类型里就没有 actor。
// 请求构造期（client.ts）在读 body 时就丢弃 actor 字段；本函数无从读取。
export function stripSelfReportedActor(payload: Record<string, unknown>): Record<string, unknown> {
  const { actor: _dropped, ...rest } = payload
  void _dropped
  return rest
}
