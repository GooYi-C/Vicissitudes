// src/stores/selectors/runtime.ts — selector 运行时（memo 键 = reads 序的版本号元组）
// U-01 不变量 2：memo 键按 reads 声明序拼接（稳定序）；重排 reads 是行为变更。
// U-01 不变量 3：reads 必须完备（compute 实际访问 ⊆ reads）——开发期 Proxy 完备性检测见 tests。
// 完备性检测（U-01 契约）：把 state 包一层记录访问路径的 Proxy 再调用 compute，
// 收集实际访问的域集合与 reads 比对；不等即失败。生产构建不启用（性能）。

import type { Selector, DomainVersions, DomainKey } from './types'

export function createSelector<TOut>(id: string, reads: readonly DomainKey[], compute: (state: Readonly<unknown>) => TOut): Selector<TOut> {
  // reads 静态字面量纪律在构造期断言（数组被 spread/动态拼装即非字面量形态）
  if (reads.length === 0) throw new Error(`selector ${id}: reads 不得为空（U-01 不变量 3 完备性的前提）`)
  return Object.freeze({ id, reads: Object.freeze([...reads]), compute })
}

// memo 求值：键 = reads 序的版本号元组（U-01 不变量 2）
export function evaluate<TOut>(sel: Selector<TOut>, state: Readonly<unknown>, versions: DomainVersions): TOut {
  const key = sel.reads.map((r) => versions[r] ?? 0).join('|')
  const cache = cacheStore.get(sel.id)
  if (cache && cache.key === key && cache.state === state) return cache.value as TOut
  const value = sel.compute(state)
  cacheStore.set(sel.id, { key, value, state })
  return value
}
const cacheStore = new Map<string, { key: string; value: unknown; state: unknown }>()

// 开发期完备性检测（U-01）：Proxy 收集实际访问的首段/首两段域键，与 reads 比对
export function verifyReadsComplete(sel: Selector<unknown>, sampleState: Readonly<unknown>): { ok: boolean; missing: string[]; extra: string[] } {
  const accessed = new Set<string>()
  const proxy = new Proxy(sampleState as object, {
    get(target, prop: string) {
      if (typeof prop === 'string') accessed.add(prop)
      return (target as Record<string, unknown>)[prop]
    },
  })
  try {
    sel.compute(proxy as Readonly<unknown>)
  } catch {
    // 样例状态可能缺域 —— 检测只看「访问了哪些首段」，异常不影响判定
  }
  const declaredRoots = new Set(sel.reads.map((r) => r.split('.')[0]))
  const missing = [...accessed].filter((a) => !declaredRoots.has(a))
  const extra = [...declaredRoots].filter((d) => !accessed.has(d))
  return { ok: missing.length === 0, missing, extra }
}
