// src/stores/persist.ts — 事务封装（§二十一 S-02）
// 不变量 2：单档单事务 —— 一次存档写入 = 单个 IDB 事务，失败不留半写。
// EXEMPT:LAYER-003 见 §十六 L-07 豁免表（stores 内部组合，2026-09-15 登记）
// 不变量 3：跨 store 原子 —— saves + meta 多 store 写在同一事务内。
// 不变量 4：读档不写库（memoryIndex 重建例外在 S-18，SK-02 阶段未触及）。
// 不变量 5：序列化键序稳定（字典序）—— 同状态同字节（SAV-10 逐位一致的前提）。
// localStorage 边界：只放轻元数据（UI 偏好），不放存档/日志/记忆/向量索引。

import { openDatabase, STORES, type StoreName, type VicDB } from './db'

let dbPromise: Promise<VicDB> | null = null

export function db(): Promise<VicDB> {
  if (!dbPromise) dbPromise = openDatabase()
  return dbPromise
}

// 确定性键序序列化（S-02 不变量 5）：递归字典序 —— 同状态产出相同字节
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

// localStorage 前缀边界（S-02）：vic.* 键只允许 UI 偏好白名单
const LS_ALLOWED_KEYS = new Set(['vic.ui.lastPanel', 'vic.ui.theme', 'vic.ui.panelOrder'])

export function lsGet(key: string): string | null {
  if (!LS_ALLOWED_KEYS.has(key)) throw new Error(`localStorage 键越界（S-02 只放轻元数据）：${key}`)
  return localStorage.getItem(key)
}

export function lsSet(key: string, value: string): void {
  if (!LS_ALLOWED_KEYS.has(key)) throw new Error(`localStorage 键越界（S-02 只放轻元数据）：${key}`)
  localStorage.setItem(key, value)
}

export interface TxOptions {
  stores: readonly StoreName[]
  mode: IDBTransactionMode
}

// 跨 store 单事务执行器：写动作全部在回调内注册，事务自动提交；
// 任一请求失败 → abort 整个事务（库内不留半写记录）
export async function inTransaction<T>(
  opts: TxOptions,
  fn: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await db()
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction([...opts.stores], opts.mode)
    let result: T
    let failed = false
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
    tx.onerror = () => {
      failed = true
      reject(tx.error)
    }
    tx.oncomplete = () => {
      if (!failed) resolve(result)
    }
    fn(tx)
      .then((r) => {
        result = r
      })
      .catch((e) => {
        failed = true
        try {
          tx.abort() // 业务失败 → 主动 abort（原子回滚）
        } catch {
          /* 已 abort 则忽略 */
        }
        reject(e)
      })
  })
}

export function put(tx: IDBTransaction, store: StoreName, value: unknown): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(store).put(value as never)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function get<T>(tx: IDBTransaction, store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

export function getAll<T>(tx: IDBTransaction, store: StoreName): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

export function del(tx: IDBTransaction, store: StoreName, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(store).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export { STORES }
