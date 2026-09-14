#!/usr/bin/env node
// data-hash.mjs — 重算内容包逐表 sha256 写回清单（§十七 D-03 / TEC-04 data:hash）
// SK-00 阶段：16 表尚未落地（属 SK-06），本脚本先立命令骨架并在无表时显式退出 0（无内容可哈希）。
// SK-06 落地后：hash 唯一合法生成途径就是本脚本，手填 hash 一律视为无效（D-03 不变量 3）。
// 稳定序列化规则（届时实现）：对象键按字典序递归排序；按表 ID 字典序计算；node:crypto，不用第三方。
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const manifestPath = join(root, 'src', 'data', 'contentPacks.json')

if (!existsSync(manifestPath)) {
  // SK-00/SK-05 阶段：src/data/ 未建 —— 显式声明状态后退出 0（命令存在且诚实）
  console.log('[data:hash] src/data/contentPacks.json 尚不存在（SK-06 落地）——无表可哈希，跳过')
  process.exit(0)
}

// SK-06 落地后的实做：逐表 import → stableSerialize → hash → 写回 manifest
// （表加载器 loadBasePack 在 SK-06 由 src/data/loader.ts 提供；届时此处接通。）
console.log('[data:hash] 骨架就绪。SK-06 落地 16 表后接通逐表哈希。')
process.exit(0)
