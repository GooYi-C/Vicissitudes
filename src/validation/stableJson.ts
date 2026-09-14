// src/validation/stableJson.ts — 确定性序列化（L1 纯函数）
// S-02 不变量 5 的算法本体：对象键字典序递归排序 —— 同状态产出相同字节。
// 住 L1（被 L7 persist 与 L4 TurnRunner 共用；类型与纯工具住被依赖层 —— L-05 不变量 1）。

export function stableStringify(value: unknown): string {
  const ser = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(ser).join(',')}]`
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
    if (v instanceof Date) return JSON.stringify(v.toISOString())
    const keys = Object.keys(v as Record<string, unknown>).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${ser((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return ser(value)
}
