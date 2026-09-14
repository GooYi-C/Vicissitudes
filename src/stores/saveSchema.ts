// src/stores/saveSchema.ts — 存档 Schema 与版本门（§二十一 S-05 / S-01）
// EXEMPT:LAYER-003 见 §十六 L-07 豁免表（stores 内部组合，2026-09-15 登记）
// SK-03：实体填充。schema 住 L7（S-05 Schema 归属定案：L1 只校验 L0 静态数据，
// 运行时状态的 schema 住 L7 —— 否则 L1→L3 反向依赖，直接违反 §十六 L-01）。
// S-05 不变量 2：SAVE_SCHEMA_VERSION 与 L0 的 SCHEMA_VERSION（§十七 D-02）是两个独立版本号。
// S-05 版本门四态：等 → 正常加载；高 → 拒载；低 → 拒载（无迁移链）；缺失/非数字 → 拒载。
// S-01：SaveRecord 与运行态同源 —— 写入即 TurnRunner 提交后的整份状态，不做增量补丁。

import { z } from 'zod'
import { TreeSchema, type PendingSituation } from '../validation/tree'

export const SAVE_SCHEMA_VERSION = 1 // 重建版起版，无迁移链（承 §3.2 第 3 层裁决）

export interface StoryEntry {
  turn: number
  date: string
  text: string
}

export interface DayFactPerson { kind: 'person'; name: string; note?: string }
export interface DayFactPromise { kind: 'promise'; from: string; to: string; dueDate?: string; what: string }
export interface DayFactDeal { kind: 'deal'; amount: number; counterparty: string; what: string }
export interface DayFactMove { kind: 'move'; from: string; to: string }
export interface DayFactSituation { kind: 'situation'; id: string; outcome?: string }
export interface DayFactNote { kind: 'note'; text: string }
export type DayFact = DayFactPerson | DayFactPromise | DayFactDeal | DayFactMove | DayFactSituation | DayFactNote

export interface DayLog {
  date: string // 游戏日（ISO）
  facts: DayFact[] // 全量，永不压缩
  narrative: string // 日叙 300–500 字
  turnRange: [number, number]
  kind?: 'transit'
}

export interface MonthLog {
  month: string // YYYY-MM
  text: string // ~200 字
}

export interface TurnRecord {
  turn: number
  date: string
  summary: string
}

export interface MemoryItem {
  id: string
  title: string
  content: string
  importance: number
  pinned: boolean
  archived: boolean
  createdAt: string
  source: 'engine' | 'extractor' | 'resolve' // 链③三源
}

export interface MemoryBook {
  items: MemoryItem[]
  order: string[]
}

export interface PressEntry {
  id: string
  date: string
  title: string
  content: string
}

export const SaveRecordSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION), // 版本门：字段值必须精确等于当前版本
  slotId: z.string().min(1),
  meta: z.object({
    date: z.string(),
    turnCount: z.number().int().min(0),
    identityId: z.string().min(1),
    eraId: z.string().min(1),
    status: z.enum(['playing', 'finished']),
    updatedAt: z.string(),
  }),
  variables: TreeSchema, // 权威状态（§十九 B-01）
  activeWindow: z.array(z.object({ turn: z.number(), date: z.string(), text: z.string() })),
  pendingSituations: z.array(z.unknown()), // SK-04 接 PendingSituation[]（B-08 快照载荷）
  memory: z.object({ items: z.array(z.unknown()), order: z.array(z.string()) }),
  dayLogs: z.array(z.unknown()), // SK-04 接 DayLog[]
  monthLogs: z.array(z.unknown()), // SK-04 接 MonthLog[]
  pastDigest: z.string(),
  turnLog: z.array(z.unknown()), // SK-04 接 TurnRecord[]；不进 prompt（S-01 不变量 2）
  pressRack: z.array(z.unknown()), // SK-04 接 PressEntry[]
})

export type SaveRecord = z.infer<typeof SaveRecordSchema>

export type SaveVersionGateResult =
  | { outcome: 'ok' }
  | { outcome: 'reject'; reason: 'higher' | 'lower' | 'missing' | 'not-number'; message: string }

export function saveVersionGate(schemaVersion: unknown): SaveVersionGateResult {
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    return { outcome: 'reject', reason: 'missing', message: '版本字段缺失或非数字 —— 拒载（不猜测为 v1）' }
  }
  if (schemaVersion > SAVE_SCHEMA_VERSION) {
    return { outcome: 'reject', reason: 'higher', message: '此档由更新版本创建 —— 拒载（不尝试降级解析）' }
  }
  if (schemaVersion < SAVE_SCHEMA_VERSION) {
    return { outcome: 'reject', reason: 'lower', message: '旧版本存档 —— 拒载（无迁移链，不做投影替代）' }
  }
  return { outcome: 'ok' }
}

// 拒载原则（S-06）：未知/损坏格式一律拒载并明确报错 —— 宁拒载不猜测。
// 加载 = 版本门 → schema 校验 → 整档返回；任一步失败即抛（错误消息含槽位/字段/期望）。
export function loadSaveRecord(raw: unknown, slotId: string): SaveRecord {
  const gate = saveVersionGate((raw as { schemaVersion?: unknown } | null)?.schemaVersion)
  if (gate.outcome === 'reject') {
    throw new Error(`存档 ${slotId} 拒载：${gate.message}`)
  }
  const parsed = SaveRecordSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new Error(`存档 ${slotId} 拒载：字段 ${first.path.join('.')} ${first.message}（期望见 S-01 SaveRecord 形状）`)
  }
  return parsed.data
}

export type { PendingSituation }
