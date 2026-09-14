#!/usr/bin/env node
// graph-check.mjs — 依赖图快照比对（§十六 L-03 / TEC-04 gate:graph）
// SK-00 阶段：src/ 只有组合根（main.ts / App.vue），边集为空 —— 快照为空集即为合法初值。
// 快照按 from 后 to 的路径字典序排序（L-03 不变量 2），diff 稳定；不给自动修复（L-03 错误语义）。
// SK-05 起：加模块不应产生快照变更；若产生，说明引入了非法边（这正是本断言的价值）。
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { layerOf } from './layers.mjs'

const root = join(import.meta.dirname, '..')
const snapPath = join(root, 'baseline', 'layer-graph.json')
const UPDATE = process.argv.includes('--update')

// LAYER-003 豁免面（§十六 L-07 豁免表，2026-09-15 登记）：L7 stores 内部组合六文件互引豁免 L-02。
// 失效条件：stores 拆层或 persist 并入单文件。豁免面外文件（selectors/* 等）与 stores 互引仍判非法。
const LAYER_003_EXEMPT = new Set([
  'src/stores/db.ts',
  'src/stores/persist.ts',
  'src/stores/saveSchema.ts',
  'src/stores/saves.ts',
  'src/stores/settings.ts',
  'src/stores/meta.ts',
])

// 轻量静态 import 提取：TS/JS 的 import ... from '...' / import '...'
function extractImports(file) {
  const text = readFileSync(file, 'utf8')
  const specs = []
  const re = /(?:import\s+(?:type\s+)?(?:[\s\S]*?from\s+)?|export\s+(?:type\s+)?[\s\S]*?from\s+)['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(text))) specs.push(m[1])
  return specs
}

// 相对 specifier → 仓库相对路径（尽力解析 .ts/.vue 后缀；外部包返回 null 不入图）
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const baseDir = join(fromFile, '..')
  let target = join(baseDir, spec)
  const candidates = [target, `${target}.ts`, `${target}.vue`, `${target}/index.ts`]
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return relative(root, c).split(sep).join('/')
  return relative(root, target).split(sep).join('/') // 解析失败也入图（会触发层校验失败）
}

const walk = (dir, acc = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|vue)$/.test(f) && !f.endsWith('.d.ts')) acc.push(p)
  }
  return acc
}

const srcFiles = walk(join(root, 'src'))
const edges = []
for (const f of srcFiles) {
  const from = relative(root, f).split(sep).join('/')
  for (const spec of extractImports(f)) {
    const to = resolveSpec(f, spec)
    if (to) edges.push({ from, to })
  }
}
edges.sort((a, b) => (a.from === b.from ? (a.to < b.to ? -1 : 1) : a.from < b.from ? -1 : 1))

// 层向合法性（L-01/L-02）：图上任何跨层/同层违规都是「非预期边」
const illegal = []
for (const e of edges) {
  const fromLayer = layerOf(e.from)
  const toLayer = layerOf(e.to)
  if (!fromLayer || !toLayer) continue // 组合根 ↔ 层文件：从组合根 import 合法（main.ts 是壳）
  if (fromLayer.n !== 0 && fromLayer.n === toLayer.n) {
    // LAYER-003：L7 stores 内部组合豁免（仅豁免面内六文件互引）
    if (!(fromLayer.n === 7 && LAYER_003_EXEMPT.has(e.from) && LAYER_003_EXEMPT.has(e.to))) {
      illegal.push(`L-02 同层：${e.from} → ${e.to}`)
    }
  }
  if (toLayer.n > fromLayer.n) illegal.push(`L-01 越层：${e.from}（${fromLayer.id}）→ ${e.to}（${toLayer.id}）`)
}

if (UPDATE) {
  writeFileSync(snapPath, JSON.stringify({ version: 1, edges }, null, 2) + '\n')
  console.log(`[graph] 快照已更新：${edges.length} 条边（人工核对 diff 无新增跨层或同层边后提交）`)
  process.exit(0)
}

if (!existsSync(snapPath)) {
  writeFileSync(snapPath, JSON.stringify({ version: 1, edges }, null, 2) + '\n')
  console.log(`[graph] 快照初始化：${edges.length} 条边`)
  process.exit(illegal.length ? 1 : 0)
}

const snap = JSON.parse(readFileSync(snapPath, 'utf8'))
const key = (e) => `${e.from}→${e.to}`
const actual = new Set(edges.map(key))
const recorded = new Set(snap.edges.map(key))
const added = [...actual].filter((k) => !recorded.has(k))
const removed = [...recorded].filter((k) => !actual.has(k))

if (added.length || removed.length) {
  console.log('[graph] FAIL —— 快照与实际 import 图不一致：')
  for (const k of added) console.log(`  + ${k}`)
  for (const k of removed) console.log(`  - ${k}`)
  console.log('  合法重构须人工核对 diff 无新增跨层/同层边后，手改 baseline/layer-graph.json（L-03：不给自动修复）')
  process.exit(1)
}
if (illegal.length) {
  console.log('[graph] FAIL —— 图上存在非法边：')
  for (const line of illegal) console.log(`  ${line}`)
  process.exit(1)
}
console.log(`[graph] PASS —— 快照一致（${edges.length} 条边），无非法边`)
