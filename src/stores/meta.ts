// src/stores/meta.ts — 跨档元数据（§二十一 S-03）
// achievements / cameoRegistry / codex 三键；跨档持久（换档、删档、回溯分叉后均保留）。
// EXEMPT:LAYER-003 见 §十六 L-07 豁免表（stores 内部组合，2026-09-15 登记）
// 错误语义：单项损坏 → 丢弃该条 + 注记；整体形状损坏 → 拒载（S-06 归口）。
// SK-02 阶段：键位与读写原子性；实体形状（CameoRecord 等）在 R2 落地。

import { z } from 'zod'
import { inTransaction, get, put } from './persist'

export const AchievementEntrySchema = z.object({
  id: z.string(),
  unlockedAt: z.string(),
  slotId: z.string(),
})
export type AchievementEntry = z.infer<typeof AchievementEntrySchema>

export interface MetaStoreShape {
  achievements: AchievementEntry[]
  cameoRegistry: unknown[] // R2：CameoRecord[]（S-14 形状）
  codex: unknown[] // R2：CodexEntry[]（含三来源频率统计）
}

const META_KEYS = ['achievements', 'cameoRegistry', 'codex'] as const
export type MetaKey = (typeof META_KEYS)[number]

export async function readMeta(key: MetaKey): Promise<{ value: unknown | undefined; note?: string }> {
  const row = await inTransaction({ stores: ['meta'], mode: 'readonly' }, (tx) =>
    get<{ key: string; value: unknown }>(tx, 'meta', key),
  )
  return { value: row?.value }
}

// 成就解锁 = 跨 store 原子写的一部分（与存档同事务 —— S-02 不变量 3）
export async function writeMetaEntries(entries: { key: MetaKey; value: unknown }[]): Promise<void> {
  await inTransaction({ stores: ['meta'], mode: 'readwrite' }, async (tx) => {
    for (const e of entries) await put(tx, 'meta', { key: e.key, value: e.value })
  })
}

export { META_KEYS }
