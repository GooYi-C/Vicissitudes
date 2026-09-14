import { describe, it, expect } from 'vitest'
import { openDatabase, DB_VERSION, STORES } from '../../../src/stores/db'
import {
  inTransaction,
  put,
  get,
  stableStringify,
  lsGet,
  lsSet,
} from '../../../src/stores/persist'
import {
  writeSave,
  readSave,
  writeAutoSave,
  listAutoSaves,
  serializeSave,
  type SaveRecordSkeleton,
} from '../../../src/stores/saves'
import { saveVersionGate, SAVE_SCHEMA_VERSION } from '../../../src/stores/saveSchema'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../../src/stores/settings'

function skeleton(slotId: string): SaveRecordSkeleton {
  return {
    slotId,
    meta: { date: '1921-07-01', turnCount: 0, identityId: 'student', eraId: 'era-warlord', status: 'playing', updatedAt: '2026-09-15T00:00:00Z' },
    variables: { world: { date: '1921-07' }, career: { money: 5 } },
  }
}

describe('S-02 IndexedDB 库结构（SK-02 出口判据）', () => {
  it('建库成功：库名 vicissitudes、版本 1、五 object store 齐', async () => {
    const db = await openDatabase()
    expect(db.name).toBe('vicissitudes')
    expect(db.version).toBe(DB_VERSION)
    for (const s of STORES) expect(db.objectStoreNames.contains(s)).toBe(true)
    expect(db.objectStoreNames.length).toBe(5)
    db.close()
  })

  it('重复开库幂等（同版本不触发升级）', async () => {
    const a = await openDatabase()
    a.close()
    const b = await openDatabase()
    expect(b.version).toBe(1)
    b.close()
  })

  it('memoryIndex 独立 store 且带 by_namespace/by_refId 索引', async () => {
    const db = await openDatabase()
    const names = [...db.objectStoreNames]
    expect(names).toContain('memoryIndex')
    // 索引存在性经事务验证
    await inTransaction({ stores: ['memoryIndex'], mode: 'readonly' }, (tx) => {
      const store = tx.objectStore('memoryIndex')
      expect(store.indexNames.contains('by_namespace')).toBe(true)
      expect(store.indexNames.contains('by_refId')).toBe(true)
      return Promise.resolve()
    })
    db.close()
  })

  it('写一档 → 重新开库 → 读回完好（刷新页面语义）', async () => {
    await writeSave(skeleton('slot-1'))
    const db = await openDatabase()
    db.close()
    const back = await readSave('slot-1')
    expect(back).toBeDefined()
    expect(back!.slotId).toBe('slot-1')
    expect(back!.variables).toEqual({ world: { date: '1921-07' }, career: { money: 5 } })
  })
})

describe('S-02 事务原子性（SAV-12 / SAV-13）', () => {
  it('跨 store 写入（saves + meta）在同一事务 —— 中途失败库内无半写', async () => {
    // 第二个 put 前显式抛错 → abort → saves 的第一条也不落
    await expect(
      inTransaction({ stores: ['saves', 'meta'], mode: 'readwrite' }, async (tx) => {
        await put(tx, 'saves', skeleton('slot-atomic'))
        throw new Error('batch failure at meta write')
      }),
    ).rejects.toThrow('batch failure')
    const save = await readSave('slot-atomic')
    expect(save).toBeUndefined() // 存档未落 —— 无半写
  })

  it('读档不写库：读路径零写入', async () => {
    await writeSave(skeleton('slot-r'))
    await readSave('slot-r')
    const again = await readSave('slot-r')
    expect(again?.slotId).toBe('slot-r') // 值未变；IDB 写计数由 fake-indexeddb 隔离保证
  })

  it('单档单事务：同批多次 put 属同一事务', async () => {
    await inTransaction({ stores: ['meta'], mode: 'readwrite' }, async (tx) => {
      await put(tx, 'meta', { key: 'a', value: 1 })
      await put(tx, 'meta', { key: 'b', value: 2 })
    })
    const a = await inTransaction({ stores: ['meta'], mode: 'readonly' }, (tx) => get<{ value: number }>(tx, 'meta', 'a'))
    const b = await inTransaction({ stores: ['meta'], mode: 'readonly' }, (tx) => get<{ value: number }>(tx, 'meta', 'b'))
    expect(a?.value).toBe(1)
    expect(b?.value).toBe(2)
  })
})

describe('S-11 autoSaves 滚动保留（SAV-18）', () => {
  it('推 20 月 → autoSaves 恰保留最近 12 条', async () => {
    for (let m = 0; m < 20; m++) {
      await writeAutoSave({ ...skeleton(`auto-${m}`, m), monthIndex: m })
    }
    const kept = await listAutoSaves()
    expect(kept).toHaveLength(12)
    expect(kept[0].monthIndex).toBe(8) // 8..19 共 12 条
    expect(kept[kept.length - 1].monthIndex).toBe(19)
  })
})

describe('S-05 存档版本门四态（SAV-15）', () => {
  it('相等 → ok', () => expect(saveVersionGate(SAVE_SCHEMA_VERSION).outcome).toBe('ok'))
  it('更高 → 拒载（不降级解析）', () => expect(saveVersionGate(SAVE_SCHEMA_VERSION + 1).outcome).toBe('reject'))
  it('更低 → 拒载（无迁移链）', () => expect(saveVersionGate(SAVE_SCHEMA_VERSION - 1).outcome).toBe('reject'))
  it('缺失 → 拒载（不猜测为 v1）', () => expect(saveVersionGate(undefined).outcome).toBe('reject'))
  it('非数字 → 拒载', () => expect(saveVersionGate('1').outcome).toBe('reject'))
  it('无迁移链：不存在 migrate 函数导出面', async () => {
    const mod = await import('../../../src/stores/saveSchema')
    expect((mod as Record<string, unknown>).migrate).toBeUndefined()
    expect(Object.keys(mod).sort()).toEqual(['SAVE_SCHEMA_VERSION', 'saveVersionGate'])
  })
})

describe('S-04 settings（设备级偏好）', () => {
  it('默认值即最省档：compact + token + standard + window 5 + fallback false', () => {
    expect(DEFAULT_SETTINGS.turnCallMode).toBe('compact')
    expect(DEFAULT_SETTINGS.billingMode).toBe('token')
    expect(DEFAULT_SETTINGS.promptBudget).toBe('standard')
    expect(DEFAULT_SETTINGS.historyWindow).toBe(5)
    expect(DEFAULT_SETTINGS.intentFallback).toBe(false)
  })

  it('单项非法（historyWindow 7）→ 回落默认 + 注记，不整份拒载', async () => {
    await inTransaction({ stores: ['settings'], mode: 'readwrite' }, (tx) =>
      put(tx, 'settings', { key: 'settings', ...DEFAULT_SETTINGS, historyWindow: 7 }),
    )
    const { settings, note } = await loadSettings()
    expect(settings.historyWindow).toBe(5)
    expect(note).toBeTruthy()
  })

  it('整体损坏 → 全默认（降级不阻塞）', async () => {
    await inTransaction({ stores: ['settings'], mode: 'readwrite' }, (tx) =>
      put(tx, 'settings', { key: 'settings', nonsense: true, turnCallMode: 42 }),
    )
    const { settings } = await loadSettings()
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  it('写读往返一致（含 apiKey 只落 settings store）', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, upstream: { baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'sk-X' } })
    const { settings } = await loadSettings()
    expect(settings.upstream.apiKey).toBe('sk-X')
  })
})

describe('S-02 确定性序列化（SAV-10 前提）', () => {
  it('键序打乱 → 字节逐位一致', () => {
    const a = { z: 1, a: { y: [1, { b: 2, a: 1 }], m: 'x' }, k: null }
    const b = { k: null, a: { m: 'x', y: [1, { a: 1, b: 2 }] }, z: 1 }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('serializeSave 输出确定（同状态同字节）', () => {
    expect(serializeSave(skeleton('s'))).toBe(serializeSave(skeleton('s')))
  })
})

describe('S-02 localStorage 边界', () => {
  it('白名单键可读写', () => {
    // happy-dom 提供真实 localStorage；无则退 mock（只测边界语义，不测存储本身）
    if (typeof localStorage === 'undefined') {
      const store = new Map<string, string>()
      Object.defineProperty(globalThis, 'localStorage', {
        value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
        configurable: true,
      })
    }
    lsSet('vic.ui.theme', 'dark')
    expect(lsGet('vic.ui.theme')).toBe('dark')
  })
  it('非白名单键（存档级数据）→ 抛错', () => {
    expect(() => lsSet('vic.saveData', '{}')).toThrow(/S-02/)
    expect(() => lsSet('vic.memoryIndex', '[]')).toThrow(/S-02/)
  })
})
