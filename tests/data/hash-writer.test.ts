import { describe, it, expect } from 'vitest'
import { makeManifest } from '../../src/data/loader'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// data:hash 的实现体（scripts/data-hash.mjs 经 vitest 调本文件）：
// 重算 16 表 hash → 写回 src/data/contentPacks.json。
// 运行模式：DATA_HASH_WRITE=1 时写回（pnpm data:hash）；否则只验一致性（test:data 常规跑）。
const MANIFEST_PATH = join(import.meta.dirname, '..', '..', 'src', 'data', 'contentPacks.json')

describe('D-01/D-03 内容包清单与 hash 门', () => {
  it('清单写回 / 校验（data:hash 唯一写入口）', () => {
    const manifest = makeManifest()
    if (process.env.DATA_HASH_WRITE === '1') {
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
      console.log(`[data:hash] 清单已写回：${manifest.id}@${manifest.version}，表数 ${manifest.tables.length}`)
      return
    }
    if (!existsSync(MANIFEST_PATH)) {
      // 首次生成（未跑过 data:hash）——写盘后继续（等价于首跑）
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
    }
    const onDisk = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    expect(onDisk).toEqual(manifest)
  })

  it('D-01 不变量：tables 全集 16 项；hash 键集 = tables（不多不少）', () => {
    const m = makeManifest()
    expect(m.tables).toHaveLength(16)
    expect(Object.keys(m.hash).sort()).toEqual([...m.tables].sort())
  })

  it('DAT-21：键序打乱后 hash 不变（稳定序列化）', async () => {
    const { tableHash } = await import('../../src/data/loader')
    const shuffled = [{ b: 2, a: 1 }, { z: { y: 1, x: 2 } }]
    const ordered = [{ a: 1, b: 2 }, { z: { x: 2, y: 1 } }]
    expect(tableHash('L0-01', shuffled)).toBe(tableHash('L0-01', ordered))
  })
})
