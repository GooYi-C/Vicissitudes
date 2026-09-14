// src/engine/rng.ts — rng 核心库（§十八 M-11：L0 级纯函数；被 TickContext 消费）
// 派生键 = (模块id, monthIndex, salt)；同三参永远同序列（B-02 契约属性）。
// 实现：xoshiro128** 种子哈希 —— 纯整数运算，无状态泄漏，同种子逐位可重放。

export interface Rng {
  next(): number
  int(maxExcl: number): number
  pick<T>(xs: readonly T[]): T
}

// FNV-1a 32 位（稳定跨机器；不用 Math.random —— B-02 不变量 2）
function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function deriveRng(moduleId: string, monthIndex: number, salt: string): Rng {
  // 种子混合：模块 id + 月序 + salt 三参全参与（同三参 → 同序列；任何一参变 → 全序列变）
  let s0 = fnv1a(`${moduleId}#${salt}`, 0x9e3779b9 ^ (monthIndex >>> 0))
  let s1 = fnv1a(salt, monthIndex + 0x85ebca6b)
  let s2 = fnv1a(moduleId, 0xc2b2ae35 ^ (monthIndex * 31 + 7))
  let s3 = fnv1a(`${salt}:${moduleId}:${monthIndex}`, 0x27d4eb2f)
  // 避免全零态（xoshiro 全零死锁）
  if ((s0 | s1 | s2 | s3) === 0) s0 = 0x9e3779b9

  const next = (): number => {
    // xoshiro128** → [0,1)
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9)
    const t = (s1 << 9) >>> 0
    s2 ^= s0
    s3 ^= s1
    s1 ^= s2
    s0 ^= s3
    s2 ^= t
    s3 = rotl(s3, 11)
    return (result >>> 0) / 4294967296
  }
  // 暖机两轮：让 s0/s2/s3（含模块 id 与月序的混合）全部进入输出链 ——
  // 否则首输出仅依赖 s1（salt），模块隔离失效（B-02「模块 id 参与派生」的落实）
  next()
  next()
  return {
    next,
    int(maxExcl: number): number {
      if (maxExcl <= 0) throw new Error(`rng.int: maxExcl 必须 > 0（收到 ${maxExcl}）`)
      return Math.floor(next() * maxExcl)
    },
    pick<T>(xs: readonly T[]): T {
      if (xs.length === 0) throw new Error('rng.pick: 空数组')
      return xs[Math.floor(next() * xs.length)]
    },
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0
}
