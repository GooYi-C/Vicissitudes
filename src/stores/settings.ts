// src/stores/settings.ts — 设备级设置（§二十一 S-04）
// 不变量 1：设备级非存档级 —— 不进 SaveRecord，换设备不随档迁移。
// EXEMPT:LAYER-003 见 §十六 L-07 豁免表（stores 内部组合，2026-09-15 登记）
// 不变量 2：apiKey 只存本地设置区 —— 不进存档/prompt 快照/导出/日志。
// 不变量 6：默认值即最省档：compact + token + standard + historyWindow 5 + intentFallback false。
// 错误语义：降级 —— 单项非法回落默认 + 注记，不整份拒载（设置是偏好，存档是事实）。

import { z } from 'zod'
import { inTransaction, get, put } from './persist'

export const SettingsSchema = z.object({
  turnCallMode: z.enum(['compact', 'split']).default('compact'),
  billingMode: z.enum(['token', 'call']).default('token'),
  extractorMode: z.enum(['auto', 'on', 'off']).default('auto'),
  promptBudget: z.enum(['thrifty', 'standard', 'full']).default('standard'),
  historyWindow: z.union([z.literal(3), z.literal(5), z.literal(10)]).default(5),
  intentFallback: z.boolean().default(false),
  cameoEgg: z
    .object({ enabled: z.boolean(), revealed: z.boolean() })
    .default({ enabled: true, revealed: false }),
  upstream: z
    .object({ baseUrl: z.string().default(''), model: z.string().default(''), apiKey: z.string().default('') })
    .default({ baseUrl: '', model: '', apiKey: '' }),
  embedding: z
    .object({
      enabled: z.boolean().default(false),
      baseUrl: z.string().default(''),
      model: z.string().default(''),
      apiKey: z.string().default(''),
      dim: z.number().nullable().default(null),
    })
    .default({ enabled: false, baseUrl: '', model: '', apiKey: '', dim: null }),
})

export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})

const KEY = 'settings'
export const SETTINGS_KEY = KEY

// extractorMode auto 语义：token → on，call → off（LL-14；解析期生效）
export function resolveExtractorMode(s: Settings): 'on' | 'off' {
  if (s.extractorMode !== 'auto') return s.extractorMode
  return s.billingMode === 'token' ? 'on' : 'off'
}

// 读：整体损坏 → 回落全默认（降级 + 注记）；单项非法 → 该项回落默认（Zod default 语义）
export async function loadSettings(): Promise<{ settings: Settings; note?: string }> {
  const raw = await inTransaction({ stores: ['settings'], mode: 'readonly' }, (tx) =>
    get<unknown>(tx, 'settings', KEY),
  )
  if (raw === undefined) return { settings: DEFAULT_SETTINGS }
  const parsed = SettingsSchema.safeParse(raw)
  if (parsed.success) return { settings: parsed.data }
  // 部分字段可救：逐字段救回（偏好降级，不拒载 —— S-04 错误语义）
  const merged = { ...(raw as Record<string, unknown>) }
  delete merged.unknown
  const rescued = SettingsSchema.safeParse(merged)
  if (rescued.success) return { settings: rescued.data, note: 'settings:非法项已回落默认' }
  return { settings: DEFAULT_SETTINGS, note: 'settings:整体损坏，回落默认' }
}

// 写：settings 只存轻元数据与端点配置；写入前 schema 校验（宁拒勿猜 —— 写侧严格）
export async function saveSettings(settings: Settings): Promise<void> {
  const parsed = SettingsSchema.parse(settings) // 写侧硬校验
  await inTransaction({ stores: ['settings'], mode: 'readwrite' }, (tx) => put(tx, 'settings', { key: KEY, ...parsed }))
}
