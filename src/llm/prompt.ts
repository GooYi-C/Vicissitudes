// EXEMPT:LAYER-008
// src/llm/prompt.ts — LL-12 prompt 段结构（静态头冻结）＋ LL-13 预算档位裁剪（最小实现）
// 段序冻结：system 静态头（文风/物价锚/声望档/世界观/memory 写入契约）→ 缓存分界线 →
// 动态段（世界状态/变量树/记忆召回/处境注入）严格置后——动态数据混进静态头是唯一违反方式。
// 记忆注入仅规则链（embedding 不在本批次）；key 不进 prompt（TEC-03 不变量 4）。
// 静态头不含任何日期/回合号/存档 id（LL-12 不变量 5）。

import type { Tree } from '../validation/tree'
import { PRICE_ANCHORS } from '../data/commodities'
import { worldbook } from '../data/worldbook'
import type { Commodity } from '../validation/dataSchemas'
import { commodities } from '../data/commodities'

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

// ── LL-13 预算档位（经济/标准/完整 ↔ settings.promptBudget thrifty/standard/full；数字原样）──
export interface BudgetTier { history: number; digest: number; worldbook: number; memory: number }
export type PromptBudgetTier = 'thrifty' | 'standard' | 'full' // 与 stores/settings PromptBudget 键同构（本模块不 import stores——LLM-012）
export const BUDGET_TIERS: Readonly<Record<PromptBudgetTier, BudgetTier>> = Object.freeze({
  thrifty: { history: 12, digest: 1200, worldbook: 4000, memory: 800 },
  standard: { history: 18, digest: 1800, worldbook: 5000, memory: 1200 },
  full: { history: 24, digest: 2400, worldbook: 6000, memory: 1200 },
})

// ── 静态头五段（同设置跨回合字节级不变 —— LL-12 不变量 1；文案质感属内容期，不在本批次打磨）──
const SEG_STYLE = [
  '①文风契约：你是民国年代的叙事者。白话行文，口语与书面杂糅，节制不煽情。',
  '只叙事玩家行动的后果与当下处境，不替玩家做决定。',
  '结构块只可用 <Command>（命令意图）、<UpdateVariable>/<JSONPatch>（微观变量补丁）、',
  '<Resolve>（处境了结）、<Propose>（提议动态处境）；未知标签会被剥除。',
].join('\n')

function segPriceAnchors(): string {
  const nameOf = new Map<string, string>(commodities.map((c: Commodity) => [c.id, String(c.name ?? c.id)]))
  const rows = Object.entries(PRICE_ANCHORS).map(([id, p]) => `${nameOf.get(id) ?? id}:${p}`)
  return `②物价锚（银元/单位，写价格时以此表为基准，不另造数）：${rows.join('，')}`
}

const SEG_TITLE = '③声望档位：声望沿 0–100 标尺分档，影响 NPC 反应与处境可见门槛；叙事只引用档位体感，不报具体数值。'

function segWorldbook(budget: number): string {
  // 世界书（L0-12 词条，静态段④）：预算字符内从头截断（顺序稳定 → 跨回合字节稳定）
  let body = ''
  for (const entry of worldbook) {
    const line = `【${entry.title}】${entry.content}`
    if (body.length + line.length > budget) break
    body += line + '\n'
  }
  return `④世界观（民国疆域常识）：\n${body.trimEnd()}`
}

// MEM-9/BIL-6 锚点文本（注入契约段必须存在）：单轮记忆写入 ≤3 条（LL-04 不变量 3）
const SEG_MEMORY_CONTRACT = [
  '⑤memory 写入契约：你可以经 <UpdateVariable> 向 /memory/items/{id} 追加记忆条目，单轮最多 3 条。',
  '记忆条目含 id/type/title/content/importance(1–9)/pinned/archived/people/monthIndex/createdAt/source("model") 字段；',
  '引擎另有保底（importance ≥7 的重要事自动入档），你的写入是补充不是唯一地。',
].join('\n')

export interface StaticHead { segments: readonly [string, string, string, string, string]; text: string; hash: string }

/** 静态头构建（只随设置变化：promptBudget 影响世界观段字符；其余四段常量） */
export function buildStaticHead(settings: { promptBudget: PromptBudgetTier }): StaticHead {
  const budget = BUDGET_TIERS[settings.promptBudget]
  const segments = [SEG_STYLE, segPriceAnchors(), SEG_TITLE, segWorldbook(budget.worldbook), SEG_MEMORY_CONTRACT] as const
  const text = segments.join('\n\n')
  return { segments, text, hash: fnv1a(text) }
}

// fnv1a-32（十六进制 8 位；模板哈希导出 —— LL-12 校验对象 LLM-13 的跨回合稳定断言）
export function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// ── 动态段（严格置后）──
export interface DynamicInput {
  tree: Readonly<Tree>
  history: readonly { turn: number; date: string; text: string }[]
  userText: string
}

/** 世界状态投影（⑥）：只读摘要，不含 authority；数字口径与面板一致（经域值直读） */
function segWorldState(tree: Readonly<Tree>): string {
  const c = tree.career as unknown as Record<string, unknown> | undefined
  const name = typeof c?.name === 'string' ? c.name : '未名'
  const money = typeof c?.money === 'number' ? c.money : 0
  const health = typeof c?.health === 'number' ? c.health : 0
  const city = typeof c?.city === 'string' ? c.city : '未知'
  const dim = tree.map?.[city]
  const dimLine = dim ? `膝城六维：经济${Math.round(dim.economy)} 治安${Math.round(dim.security)} 文化${Math.round(dim.culture)} 交通${Math.round(dim.transport)} 实业${Math.round(dim.industry)} 人口${Math.round(dim.population)}` : ''
  return `⑥世界状态：${tree.world.date}，你在${city}，${name}，银元${money}，健康${health}。${dimLine}`
}

/** 变量树摘要（⑦）：主角级域（career/player）简表 —— 模型补丁的目标面 */
function segVariableTree(tree: Readonly<Tree>): string {
  const lines: string[] = []
  const c = tree.career as unknown as Record<string, unknown> | undefined
  if (c) for (const [k, v] of Object.entries(c)) lines.push(`career.${k}=${typeof v === 'object' ? '…' : String(v)}`)
  const p = tree.player as unknown as Record<string, unknown> | undefined
  if (p) for (const [k, v] of Object.entries(p)) lines.push(`player.${k}=${typeof v === 'object' ? '…' : String(v)}`)
  return `⑦变量树（可写域只含 career/player/memory.items）：\n${lines.join('\n')}`
}

/** 记忆召回（⑧，规则链）：未归档、importance 降序、pinned 优先、预算字符内截断 */
function segMemoryRecall(tree: Readonly<Tree>, budget: number): string {
  const items = Object.values(tree.memory?.items ?? {})
  const scored = [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.importance - a.importance)
  const lines: string[] = []
  let used = 0
  for (const m of scored) {
    if (m.archived) continue
    const line = `·[${m.type}] ${m.title}（重要${m.importance}）`
    if (used + line.length > budget) break
    lines.push(line); used += line.length
  }
  return `⑧记忆召回（规则链，未归档条目）：${lines.length ? '\n' + lines.join('\n') : '（空）'}`
}

/** 处境注入（⑨，LL-12 不变量 3 必须注入）：visible pending situations 摘要 */
function segSituations(tree: Readonly<Tree>): string {
  const queue = tree._authority?.pendingSituations?.queue ?? {}
  const iso = `${tree.world.date}-01`
  const visible = Object.values(queue).filter((s) => s.expiresAt > iso)
  if (visible.length === 0) return '⑨处境注入：当前无待决处境。'
  const lines = visible.map((s) => `·${s.key}「${s.payload.title}」选项${s.payload.options.length}个（到期 ${s.expiresAt}）`)
  return `⑨处境注入（可见待决，Resolve 只可引用本批 key）：\n${lines.join('\n')}`
}

/** 回合消息组装（LL-12 段序：静态头 → 动态段置后 → 历史 → 玩家输入；同输入 → 同消息序列） */
export function buildChatMessages(input: DynamicInput, settings: { promptBudget: PromptBudgetTier }): ChatMessage[] {
  const budget = BUDGET_TIERS[settings.promptBudget]
  const head = buildStaticHead(settings)
  const dynamic = [segWorldState(input.tree), segVariableTree(input.tree), segMemoryRecall(input.tree, budget.memory), segSituations(input.tree)].join('\n\n')
  const messages: ChatMessage[] = [{ role: 'system', content: head.text }, { role: 'system', content: dynamic }]
  const digest = input.history.slice(-budget.history)
  let digestText = digest.map((h) => `${h.date}：${h.text}`).join('\n')
  if (digestText.length > budget.digest) digestText = digestText.slice(digestText.length - budget.digest)
  if (digestText) messages.push({ role: 'user', content: `往事记要：\n${digestText}` })
  messages.push({ role: 'user', content: input.userText })
  return messages
}
