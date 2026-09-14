// tests/unit/stores/setup.ts — fake-indexeddb 全局注入（stores 测试专用）
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach } from 'vitest'

// 每个测试获得全新 IDB 实例（隔离；fake-indexeddb/auto 默认全局共享同一实例）
beforeEach(() => {
  indexedDB = new IDBFactory()
})
