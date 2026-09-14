// src/stores/saves.ts — 存档 store（§二十一 S-01 / S-11）
// EXEMPT:LAYER-003 见 §十六 L-07 豁免表（stores 内部组合，2026-09-15 登记）
// SK-03：SaveRecord 实体（S-01 全字段）；写入 = 整份快照（TurnRunner 提交后），不做增量补丁。
// S-02 不变量 3：saves + meta 跨 store 写在同一事务。

import { inTransaction, get, put, getAll, del, stableStringify } from './persist'
import type { SaveRecord, StoryEntry, DayLog, MonthLog, TurnRecord, MemoryBook, PressEntry, PendingSituation } from './saveSchema'

export type { SaveRecord }

export async function writeSave(record: SaveRecord): Promise<void> {
  await inTransaction({ stores: ['saves'], mode: 'readwrite' }, (tx) => put(tx, 'saves', record))
}

// 跨 store 原子写（SAV-13）：存档 + 成就/图鉴等 meta 同事务落库
export async function writeSaveWithMeta(
  record: SaveRecord,
  metaEntries: { key: string; value: unknown }[],
): Promise<void> {
  await inTransaction({ stores: ['saves', 'meta'], mode: 'readwrite' }, async (tx) => {
    await put(tx, 'saves', record)
    for (const m of metaEntries) await put(tx, 'meta', { key: m.key, value: m.value })
  })
}

export async function readSave(slotId: string): Promise<SaveRecord | undefined> {
  return inTransaction({ stores: ['saves'], mode: 'readonly' }, (tx) => get<SaveRecord>(tx, 'saves', slotId))
}

export async function listSaves(): Promise<SaveRecord[]> {
  return inTransaction({ stores: ['saves'], mode: 'readonly' }, (tx) => getAll<SaveRecord>(tx, 'saves'))
}

export async function deleteSave(slotId: string): Promise<void> {
  await inTransaction({ stores: ['saves'], mode: 'readwrite' }, (tx) => del(tx, 'saves', slotId))
}

// 序列化快照（SAV-10 逐位一致用）：确定性键序
export function serializeSave(record: SaveRecord): string {
  return stableStringify(record)
}

// SK-03 起始档构造（startGame 开局命令消费；era 一次写入此后只读）
export function makeInitialSave(params: {
  slotId: string
  eraId: string
  identityId: string
  date: string // YYYY-MM
  variables: SaveRecord['variables']
  updatedAt: string // 由命令层传入（引擎侧禁 Date —— B-02）
}): SaveRecord {
  return {
    schemaVersion: 1,
    slotId: params.slotId,
    meta: {
      date: params.date,
      turnCount: 0,
      identityId: params.identityId,
      eraId: params.eraId,
      status: 'playing',
      updatedAt: params.updatedAt,
    },
    variables: params.variables,
    activeWindow: [] as StoryEntry[],
    pendingSituations: [] as PendingSituation[],
    memory: { items: [], order: [] } as MemoryBook,
    dayLogs: [] as DayLog[],
    monthLogs: [] as MonthLog[],
    pastDigest: '',
    turnLog: [] as TurnRecord[],
    pressRack: [] as PressEntry[],
  }
}

// ── autoSaves（S-11：月初快照，滚动保留）─────────────────────────
export interface AutoSaveRecord extends SaveRecord {
  monthIndex: number
}

const AUTO_KEEP = 12 // 滚动保留初值（S-11 不变量 2）

export async function writeAutoSave(record: AutoSaveRecord): Promise<void> {
  await inTransaction({ stores: ['autoSaves'], mode: 'readwrite' }, async (tx) => {
    await put(tx, 'autoSaves', record)
    const all = await getAll<AutoSaveRecord>(tx, 'autoSaves')
    if (all.length > AUTO_KEEP) {
      const sorted = [...all].sort((a, b) => a.monthIndex - b.monthIndex)
      const toDelete = sorted.slice(0, all.length - AUTO_KEEP)
      for (const r of toDelete) await del(tx, 'autoSaves', r.slotId)
    }
  })
}

export async function listAutoSaves(): Promise<AutoSaveRecord[]> {
  const all = await inTransaction({ stores: ['autoSaves'], mode: 'readonly' }, (tx) => getAll<AutoSaveRecord>(tx, 'autoSaves'))
  return all.sort((a, b) => a.monthIndex - b.monthIndex)
}
