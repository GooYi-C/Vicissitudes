// src/stores/saveSchema.ts — 存档 Schema 类型位（§二十一 S-05）
// SK-02：只立 SAVE_SCHEMA_VERSION 常量与版本门骨架；实体 Zod schema 在 SK-03 填（与变量树同批）。
// EXEMPT:LAYER-003 见 §十六 L-07 豁免表（stores 内部组合，2026-09-15 登记）
// S-05 不变量 2：SAVE_SCHEMA_VERSION 与 L0 的 SCHEMA_VERSION（§十七 D-02）是两个独立版本号。
// S-05 版本门四态：等 → 正常加载；高 → 拒载；低 → 拒载（无迁移链）；缺失/非数字 → 拒载。

export const SAVE_SCHEMA_VERSION = 1 // 重建版起版，无迁移链（承 §3.2 第 3 层裁决）

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
