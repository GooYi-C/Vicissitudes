// L6 llm 回合链（§二十 S-07 / LLM-105：一读若干写一条流水线；hook 出口在 App.vue 组合根，LLM-106）
// 落位记：2026-09-17 拍板 B —— 合同 §二十 S-07/LL-102 原文 src/turn/turnLoop.ts 与 L-01 单向表冲突
//（L4 组合引 L6 parser 属逆向），迁 src/llm/ 后引 parser=同层（LAYER-008 组合豁免）、引 turn/validation/engine/orchestration=全部下引，零新豁免先例。
// runModelTurn(tree, modelText)：parseBlocks → 自报剥离（LLM-15）→ authorize → 分派 → sanitize → compile+applyPatch 单次原子。
// 认输是诊断（M-08）；逐块诊断如实计入（LLM-18 统一承认口径）；proposeSeen/Usable 计数随 metrics 返（LLM-107 落地的观测面）。
// EXEMPT:LAYER-008

import { parseBlocks } from '../parser/blocks'
import { authorize, narratorCapability, stripSelfReportedActor } from '../parser/authorize'
import { buildDomainWhitelist, sanitize } from '../parser/sanitize'
import { clampProposal } from '../parser/propose'
import { compileCommand, compile } from '../turn/compiler'
import { resolveSituation, type ResolveRef } from '../turn/resolves'
import { applyPatch, domainOfPath } from '../turn/TurnRunner'
import type { Tree } from '../validation/tree'
import type { DomainEffect, JsonPatchOp } from '../validation/effects'
import type { Diagnostic } from '../parser/blocks'

export interface TurnMetrics {
  blocksTotal: number      // 意图片总数（遵循率分母）
  blocksApplied: number    // 成功下链数（遵循率分子）
  proposeSeen: number      // 提议块数（可用率分母；单轮 ≤1 —— 第 2 块起即拒绝）
  proposeUsable: number    // 通过钳制入队数（可用率分子）
}

export interface ModelTurnResult {
  ok: boolean
  state: Tree
  narrative: string
  writtenDomains: string[]
  diagnostics: Diagnostic[]
  metrics: TurnMetrics
}

const SINGLE_PROPOSE_PER_TURN = 1 // LL-07 表末行：单轮提议条数 ≤1

export function runModelTurn(tree: Readonly<Tree>, modelText: string): ModelTurnResult {
  const diagnostics: Diagnostic[] = []
  const metrics: TurnMetrics = { blocksTotal: 0, blocksApplied: 0, proposeSeen: 0, proposeUsable: 0 }

  const parsed = parseBlocks(modelText)
  diagnostics.push(...parsed.diagnostics.map((d) => ({ ...d, moduleId: 'llm/pipe' })))
  const cap = narratorCapability()
  const wl = buildDomainWhitelist()

  const effects: DomainEffect[] = []
  const patchOps: JsonPatchOp[] = []
  let proposeUsed = 0

  for (const rawBlock of parsed.blocks) {
    metrics.blocksTotal += 1
    // 自报 actor 构造期剥离（LLM-15）：payload 对象先过 strip
    const block = { ...rawBlock, payload: typeof rawBlock.payload === 'object' && rawBlock.payload !== null ? stripSelfReportedActor(rawBlock.payload as Record<string, unknown>) : rawBlock.payload }
    const auth = authorize(block, cap)
    if (!auth.ok) {
      diagnostics.push({ moduleId: 'llm/pipe', code: auth.code, detail: auth.detail })
      continue
    }
    switch (block.tag) {
      case 'UpdateVariable':
      case 'JSONPatch': {
        const ops = (block.payload as { ops?: JsonPatchOp[] }).ops
        if (Array.isArray(ops)) patchOps.push(...ops)
        metrics.blocksApplied += 1 // 下链计数 = 进入 sanitize（越界剥除属 T1 兜底，不算整块灭）
        break
      }
      case 'Command': {
        const p = block.payload as { cmd: string; args?: Record<string, unknown> }
        try {
          effects.push(...compileCommand({ cmd: p.cmd, args: p.args ?? {} }, tree))
          metrics.blocksApplied += 1
        } catch (e) {
          diagnostics.push({ moduleId: 'llm/pipe', code: 'rejected', detail: `命令编译失败：${(e as Error).message}` })
        }
        break
      }
      case 'Resolve': {
        const p = block.payload as ResolveRef
        const settled = resolveSituation(p, tree)
        if (!settled.ok) {
          diagnostics.push({ moduleId: 'llm/pipe', code: 'rejected', detail: settled.message })
          break
        }
        effects.push(...settled.effects)
        metrics.blocksApplied += 1
        break
      }
      case 'Propose': {
        metrics.proposeSeen += 1
        if (proposeUsed >= SINGLE_PROPOSE_PER_TURN) {
          diagnostics.push({ moduleId: 'llm/pipe', code: 'proposal-rejected', detail: '单轮提议 >1（LL-07 表末行）' })
          break
        }
        proposeUsed += 1
        const verdict = clampProposal(block.payload as Parameters<typeof clampProposal>[0], tree.world.date, tree._authority.pendingSituations.queue)
        if (!verdict.ok) {
          diagnostics.push({ moduleId: 'llm/pipe', code: verdict.code, detail: verdict.detail })
          break
        }
        effects.push({ op: 'situationEnqueue', args: { situation: verdict.situation } })
        metrics.proposeUsable += 1
        metrics.blocksApplied += 1
        break
      }
      case 'Intervene': {
        // 历史介入宿主链（时间窗/证据/条件三验三阶段）不在 VS-01 —— 如实计为不遵循，不含特殊处理
        diagnostics.push({ moduleId: 'llm/pipe', code: 'bad-block', detail: 'Intervene 宿主链未在本批次（VS-01 范围外活动面）' })
        break
      }
      default:
        diagnostics.push({ moduleId: 'llm/pipe', code: 'bad-block', detail: `未知块 ${block.tag}` })
    }
  }

  // sanitize（T1 逐 op 剥除 + 注记）
  const sanitized = sanitize(patchOps, wl)
  for (const rej of sanitized.rejected) {
    diagnostics.push({ moduleId: 'llm/pipe', code: 'rejected', path: rej.path, detail: `${rej.reason}: ${rej.detail}` })
  }

  // 单次原子提交：compile(effects) + sanitize 接受补丁并批（序：engine 效果在前，补丁在后——序稳定）
  const compiled = compile(effects, tree)
  const ops = [...compiled, ...sanitized.accepted]
  const next = applyPatch(tree, ops)
  if (next === null) {
    return {
      ok: false, state: tree as Tree, narrative: parsed.narrative, writtenDomains: [],
      diagnostics: [...diagnostics, { moduleId: 'llm/pipe', code: 'rejected', detail: '批内存在非法 op——整批丢弃（原子回滚）' }],
      metrics,
    }
  }
  return {
    ok: true, state: next, narrative: parsed.narrative,
    writtenDomains: [...new Set(ops.map((o) => domainOfPath(o.path)).filter(Boolean))],
    diagnostics, metrics,
  }
}
