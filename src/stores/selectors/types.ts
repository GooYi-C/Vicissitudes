// src/stores/selectors/types.ts — selector 类型与域版本号机制（§二十二 U-01/U-02）
export type DomainKey = string // 与 M-03 写域登记表「状态域」列一一对应

export interface Selector<TOut> {
  readonly id: string // 稳定 ID（baseline 引用）
  readonly reads: readonly DomainKey[] // 静态字面量（U-01 不变量 1）
  readonly compute: (state: Readonly<unknown>) => TOut
}

// U-02：域版本号（会话内状态，不进存档；bump 集合 = 实际命中域）
export type DomainVersions = Readonly<Record<DomainKey, number>>

export function bumpDomains(versions: DomainVersions, written: readonly DomainKey[]): DomainVersions {
  const next: Record<DomainKey, number> = { ...versions }
  for (const d of written) next[d] = (next[d] ?? 0) + 1
  return next
}
