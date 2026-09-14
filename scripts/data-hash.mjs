#!/usr/bin/env node
// data-hash.mjs — 重算内容包逐表 sha256 写回清单（§十七 D-03 / TEC-04 data:hash）
// hash 唯一合法生成途径 = 本脚本；实现体在 tests/data/hash-writer.test.ts
// （vitest 原生跑 TS import——清单写回即一次测试运行，顺带全量校验）。
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
try {
  execFileSync('pnpm', ['vitest', 'run', 'tests/data/hash-writer.test.ts'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })
} catch {
  console.error('[data:hash] 写回失败 —— 见上方 vitest 输出')
  process.exit(1)
}
