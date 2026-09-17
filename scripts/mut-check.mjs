#!/usr/bin/env node
// mut-check.mjs — 故障注入（gate:mut）：证明 static-checks 不是恒真空转（承文档仓 mut-check 哲学）
// 注入已知故障 → static-checks 必须失败；不失败即该检查已被改废（TEC-04）。
// 临时改动只发生在临时目录副本中，结束后工作区零残留。
import { mkdtempSync, cpSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = join(import.meta.dirname, '..')
const results = []

function runMutation(name, mutate, shouldFail = true) {
  const tmp = mkdtempSync(join(tmpdir(), 'vic-mut-'))
  try {
    // 复制最小闭包：static-checks 读取的全部路径
    cpSync(join(root, 'scripts'), join(tmp, 'scripts'), { recursive: true })
    for (const f of ['package.json', '.gitignore', 'pnpm-lock.yaml']) cpSync(join(root, f), join(tmp, f))
    cpSync(join(root, 'src'), join(tmp, 'src'), { recursive: true })
    mkdirSync(join(tmp, 'baseline'), { recursive: true })
    cpSync(join(root, 'baseline', 'assertions.json'), join(tmp, 'baseline', 'assertions.json'))
    mutate(tmp)
    let exitCode = 0
    try {
      execFileSync(process.execPath, [join(tmp, 'scripts', 'static-checks.mjs')], { stdio: 'pipe', cwd: tmp })
    } catch (e) {
      exitCode = e.status ?? 1
    }
    const caught = shouldFail ? exitCode !== 0 : exitCode === 0
    results.push({ name, caught })
    console.log(`${caught ? '[ok]' : '[X]'} ${name} → static-checks exit=${exitCode}（预期${shouldFail ? '失败' : '通过'}）`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function patchPkg(tmp, fn) {
  const pkgPath = join(tmp, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  fn(pkg)
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
}

// 正常对照先行：夹具缺失等环境错误不能被当成成功捕获。
runMutation('C0 无注入正常对照', () => {}, false)

// M1 TEC-01：注入浮动版本
runMutation('M1 浮动版本注入（vue → ^5.0.0）', (tmp) => {
  patchPkg(tmp, (p) => { p.dependencies.vue = '^5.0.0' })
})

// M2 TEC-05：注入禁用依赖 electron
runMutation('M2 禁用依赖注入（electron）', (tmp) => {
  patchPkg(tmp, (p) => { p.devDependencies.electron = '33.0.0' })
})

// M3 LAYER-6：注入 src/core/ 目录
runMutation('M3 src/core/ 中间层复活', (tmp) => {
  mkdirSync(join(tmp, 'src', 'core'), { recursive: true })
  writeFileSync(join(tmp, 'src', 'core', 'evil.ts'), 'export const x = 1\n')
})

// M4 TEC-02：注入表外顶层目录 src/shared/
runMutation('M4 表外顶层目录注入（src/shared/）', (tmp) => {
  mkdirSync(join(tmp, 'src', 'shared'), { recursive: true })
  writeFileSync(join(tmp, 'src', 'shared', 'types.ts'), 'export type X = 1\n')
})

// M5 TEC-05：注入禁用字符串 _meta
runMutation('M5 源码禁用字符串注入（_meta）', (tmp) => {
  writeFileSync(join(tmp, 'src', 'main.ts'), 'export const _meta = 1\n')
})

// LLM-40：部署入口复活必须被拦住，不靠“前端暂时不用”维持静态形态。
runMutation('M6 CF 代理入口复活', (tmp) => {
  mkdirSync(join(tmp, 'functions', 'api'), { recursive: true })
  writeFileSync(join(tmp, 'functions', 'api', 'chat.ts'), 'export const onRequest = () => new Response("bad")\n')
})
runMutation('M7 静态 public 夹带 Worker', (tmp) => {
  mkdirSync(join(tmp, 'public'), { recursive: true })
  writeFileSync(join(tmp, 'public', '_worker.js'), 'export default {}\n')
})

const misses = results.filter((r) => !r.caught)
if (misses.length) {
  console.log(`\n[mut] FAIL —— ${misses.length} 个注入未被捕获，对应检查恒真空转`)
  process.exit(1)
}
console.log(`\n[mut] PASS —— ${results.length}/${results.length} 验证通过（含正常对照），校验非空转`)
