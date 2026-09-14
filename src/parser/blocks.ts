// src/parser/blocks.ts — 结构块语法（§二十 LL-02）
// EXEMPT:LAYER-005 见 §十六 L-07 豁免表（parser 意图链三段组合，2026-09-15 登记）
// XML 标签包裹 JSON 载荷；逐块容错（坏块丢弃 + 注记，回合不中断）；解析无副作用。
// 未知标签按叙事正文处理（不视为错误）。payload 经 __proto__ 防护后才进后续链路。

export type BlockTag = 'UpdateVariable' | 'JSONPatch' | 'Resolve' | 'Command' | 'Propose' | 'Intervene'

export interface Block {
  tag: BlockTag
  raw: string
  payload: unknown
  at: number // 在原文中的起始偏移
}

export interface Diagnostic {
  moduleId: string
  code: string
  monthIndex?: number
  path?: string
  detail?: string
}

export interface ParseResult {
  narrative: string
  blocks: Block[]
  diagnostics: Diagnostic[]
}

// 标签封闭枚举即正则字面量（KNOWN_TAGS 与 re 内枚举一致 —— 新增标签 = 改正则 + BlockTag，两处同改）

// __proto__ 防护（DAT-22 同源）：载荷解析后递归剥除危险键
function sanitizeObject(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sanitizeObject)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
      out[k] = sanitizeObject(val)
    }
    return out
  }
  return v
}

export function parseBlocks(raw: string): ParseResult {
  const diagnostics: Diagnostic[] = []
  const blocks: Block[] = []
  let narrative = raw

  // 逐个提取 <Tag>...</Tag>（标签封闭枚举；未知标签留在叙事里）
  const re = /<(UpdateVariable|JSONPatch|Resolve|Command|Propose|Intervene)>([\s\S]*?)<\/\1>/g
  const removals: { start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const tag = m[1] as BlockTag
    const inner = m[2].trim()
    const at = m.index
    removals.push({ start: m.index, end: m.index + m[0].length })
    try {
      const payload = JSON.parse(inner)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('payload 非对象')
      }
      blocks.push({ tag, raw: m[0], payload: sanitizeObject(payload), at })
    } catch (e) {
      // LL-02 不变量 1：坏块丢弃 + 注记，其余照常（SSE 中断也能保住已收块的结构前提）
      diagnostics.push({
        moduleId: 'parser',
        code: 'bad-block',
        detail: `${tag} 块解析失败：${(e as Error).message}`,
      })
    }
  }

  // 叙事正文 = 原文去除全部已识别结构块片段（LL-02 不变量 2）；块独占一行时整行收拢
  for (let i = removals.length - 1; i >= 0; i--) {
    narrative = narrative.slice(0, removals[i].start) + narrative.slice(removals[i].end)
  }
  // 行级清理：独占一行的块残留空行 → 删；块与文字同行残留多空格 → 收拢
  narrative = narrative
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')

  // 块序稳定：按出现序（at 升序）；不重排（LL-01 确定性同源）
  blocks.sort((a, b) => a.at - b.at)
  return { narrative, blocks, diagnostics }
}
