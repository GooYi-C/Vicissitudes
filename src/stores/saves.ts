// src/stores/saves.ts — 存档 store（§二十一 S-01 / S-11）
// SK-02 阶段：类型位 + 读写原子性。SaveRecord 实体形状（variables/tree）在 SK-03 定。
// EXEMPT:LAYER-003 见 §十六 L-07 豁免表（stores 内部组合，2026-09-15 登记）
// S-01 不变量 1：写入 = 整份快照（TurnRunner 提交后），不做增量补丁。
// S-02 不变量 3：saves + meta 跨 store 写在同一事务。

import { inTransaction, get, put, getAll, del, stableStringify } from './persist'

// SK-03 将填实体的类型位（S-01 字段全列，variables 以 unknown 占位至树形状定案）
export interface SaveMeta {
  date: string
  turnCount: number
  identityId: string
  eraId: string
  status: 'playing' | 'finished'
  updatedAt: string
}

export interface SaveRecordSkeleton {
  slotId: string
  meta: SaveMeta
  variables: unknown // SK-03：Tree（变量树形状在 src/validation/tree.ts 定案）
  // SK-03+ 逐批补齐：activeWindow / pendingSituations / memory / dayLogs / monthLogs /
  // pastDigest / turnLog / pressRack（S-01 全字段清单）
}

export async function writeSave(record: SaveRecordSkeleton): Promise<void> {
  // 整份写（单 store 单事务）；updatedAt 由调用方维护（S-11 月初快照与手动档共用）
  await inTransaction({ stores: ['saves'], mode: 'readwrite' }, (tx) => put(tx, 'saves', record))
}

// 跨 store 原子写（SAV-13）：存档 + 成就/图鉴等 meta 同事务落库
export async function writeSaveWithMeta(
  record: SaveRecordSkeleton,
  metaEntries: { key: string; value: unknown }[],
): Promise<void> {
  await inTransaction({ stores: ['saves', 'meta'], mode: 'readwrite' }, async (tx) => {
    await put(tx, 'saves', record)
    for (const m of metaEntries) await put(tx, 'meta', { key: m.key, value: m.value })
  })
}

export async function readSave(slotId: string): Promise<SaveRecordSkeleton | undefined> {
  return inTransaction({ stores: ['saves'], mode: 'readonly' }, (tx) => get<SaveRecordSkeleton>(tx, 'saves', slotId))
}

export async function listSaves(): Promise<SaveRecordSkeleton[]> {
  return inTransaction({ stores: ['saves'], mode: 'readonly' }, (tx) => getAll<SaveRecordSkeleton>(tx, 'saves'))
}

export async function deleteSave(slotId: string): Promise<void> {
  await inTransaction({ stores: ['saves'], mode: 'readwrite' }, (tx) => del(tx, 'saves', slotId))
}

// 序列化快照（SAV-10 逐位一致用）：确定性键序
export function serializeSave(record: SaveRecordSkeleton): string {
  return stableStringify(record)
}

// ── autoSaves（S-11：月初快照，滚动保留）─────────────────────────
export interface AutoSaveRecord extends SaveRecordSkeleton {
  monthIndex: number
}

const AUTO_KEEP = 12 // 滚动保留初值（S-11 不变量 2）

export async function writeAutoSave(record: AutoSaveRecord): Promise<void> {
  await inTransaction({ stores: ['autoSaves'], mode: 'readwrite' }, async (tx) => {
    await put(tx, 'autoSaves', record)
    // 滚动保留：超限删最旧（按 monthIndex）
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
