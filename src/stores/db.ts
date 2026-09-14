// src/stores/db.ts — IndexedDB 开库与升级（§二十一 S-02）
// 库名 vicissitudes（全仓唯一）；五 object store：saves / autoSaves / meta / settings / memoryIndex。
// EXEMPT:LAYER-003 见 §十六 L-07 豁免表（stores 内部组合，2026-09-15 登记）
// 不变量：本文件与 persist.ts 是仅有的触碰 indexedDB 的模块（IO 唯一入口）。
// S-05：新增 object store 属「有迁移」动作 —— DB_VERSION 递增 + onupgradeneeded + 登记理由。

export const DB_NAME = 'vicissitudes'
export const DB_VERSION = 1

export type StoreName = 'saves' | 'autoSaves' | 'meta' | 'settings' | 'memoryIndex'

export const STORES: readonly StoreName[] = ['saves', 'autoSaves', 'meta', 'settings', 'memoryIndex']

export type VicDB = IDBDatabase

export function openDatabase(): Promise<VicDB> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // v1：五 store 全量建齐（S-02 object store 布局表）
      if (!db.objectStoreNames.contains('saves')) {
        const s = db.createObjectStore('saves', { keyPath: 'slotId' })
        s.createIndex('by_updatedAt', 'meta.updatedAt')
      }
      if (!db.objectStoreNames.contains('autoSaves')) {
        const s = db.createObjectStore('autoSaves', { keyPath: 'slotId' })
        s.createIndex('by_monthIndex', 'monthIndex')
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('memoryIndex')) {
        const s = db.createObjectStore('memoryIndex', { keyPath: 'id' })
        s.createIndex('by_namespace', 'namespace')
        s.createIndex('by_refId', 'refId')
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB open blocked（其他标签页持有旧版本连接）'))
  })
}

// 唯一库名断言用：全仓不得出现第二个 indexedDB.open 调用点（SAV 侧静态检查）
export const IDB_OPEN_SITES = 'src/stores/db.ts'
