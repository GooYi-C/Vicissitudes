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
    // 实现体（tests/data/hash-writer.test.ts）只在 DATA_HASH_WRITE=1 时写回清单；
    // 此前本脚本不设该变量，写回分支永不可达 —— 清单只在文件不存在时被首次生成兜底写盘。
    env: { ...process.env, DATA_HASH_WRITE: '1' },
  })
} catch {
  console.error('[data:hash] 写回失败 —— 见上方 vitest 输出')
  process.exit(1)
}
