#!/usr/bin/env node
// static-checks.mjs — 代码仓静态断言（TEC-01 / TEC-02 / TEC-05 / L-04 / U-02 侧）
// 退出码即结论（TEC-04 不变量：「gate 非零退出即不得宣称完成」）。
// 对应断言：TEC-1..5（版本策略/目录树/禁用清单）· LAYER-6（src/core/ 废除）· S-04 侧（key 不入存档的静态面在 SK-02+ 接管）
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { SRC_ROOT_DIRS, SRC_ROOT_FILES } from './layers.mjs'
import { staticDeployIssues } from './check-static-deploy.mjs'

const root = join(import.meta.dirname, '..')
const fail = []
const ok = []
const check = (id, cond, msg) => (cond ? ok.push(`  [ok] ${id} ${msg}`) : fail.push(`  [X] ${id} ${msg}`))

// ── TEC-01 依赖与版本策略 ──────────────────────────────────────────
// 不变量 1：dependencies/devDependencies 全部精确版本，无 ^/~/latest/*
// 不变量 2：唯一 lockfile = pnpm-lock.yaml 且入库（.gitignore 不忽略它）
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const floating = (v) => /^[\^~]|latest|\*/.test(v)
const badDeps = []
for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
  for (const [name, ver] of Object.entries(pkg[section] ?? {})) if (floating(ver)) badDeps.push(`${section}.${name}@${ver}`)
}
check('TEC-1', badDeps.length === 0, badDeps.length === 0 ? '全部依赖为精确版本（-E，无 ^/~/latest/*）' : `浮动版本：${badDeps.join(', ')}`)
check('TEC-1', existsSync(join(root, 'pnpm-lock.yaml')), 'pnpm-lock.yaml 存在且为唯一 lockfile')
if (existsSync(join(root, 'package-lock.json')) || existsSync(join(root, 'yarn.lock'))) {
  check('TEC-1', false, '出现第二份 lockfile（npm/yarn）')
}
const gitignore = readFileSync(join(root, '.gitignore'), 'utf8')
check('TEC-1', !/^\s*pnpm-lock\.yaml\s*$/m.test(gitignore) && !/^\/?pnpm-lock\.yaml/m.test(gitignore), 'lockfile 未被 .gitignore 忽略')
check('TEC-1', /^node_modules/m.test(gitignore), 'node_modules 已忽略（不入库）')

// ── TEC-02 仓库目录树 ──────────────────────────────────────────────
// 不变量：src/ 顶层只出现层目录（L-01 八层）与组合根文件；表外目录即失败（防「shared/common/core」复活）
const srcTop = readdirSync(join(root, 'src'))
const unexpectedDirs = srcTop.filter((f) => {
  const p = join(root, 'src', f)
  if (!statSync(p).isDirectory()) return false
  return !SRC_ROOT_DIRS.includes(f)
})
const unexpectedFiles = srcTop.filter((f) => {
  const p = join(root, 'src', f)
  return !statSync(p).isDirectory() && !SRC_ROOT_FILES.includes(f)
})
check('TEC-2', unexpectedDirs.length === 0, unexpectedDirs.length === 0 ? 'src/ 顶层无表外目录（八层一一对应）' : `表外顶层目录：${unexpectedDirs.join(', ')}（L-01/L-04：新增目录须先改层表）`)
check('TEC-2', unexpectedFiles.length === 0, unexpectedFiles.length === 0 ? 'src/ 顶层文件均在组合根白名单' : `表外顶层文件：${unexpectedFiles.join(', ')}`)

// ── L-04 目录口径定案：src/core/ 不存在 ───────────────────────────
check('LAYER-6', !existsSync(join(root, 'src', 'core')), 'src/core/ 中间层不存在（已废除，销项 §0.3-E4）')

// ── TEC-05 禁用清单 ────────────────────────────────────────────────
// 依赖名黑名单（Electron/Tauri/Capacitor/Flutter/RN、独立 Node 服务端、raster/像素回归、Workbox）
const depBlacklist = [
  /^electron$/,
  /^@tauri-apps\//,
  /^@capacitor\//,
  /^flutter/,
  /^react-native$/,
  /^express$/,
  /^fastify$/,
  /^koa$/,
  /^hono$/,
  /^workbox-[a-z-]+$/,
  /^puppeteer$/,
  /^playwright$/,
]
const allDeps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
const hitDeps = allDeps.filter((d) => depBlacklist.some((re) => re.test(d)))
check('TEC-5', hitDeps.length === 0, hitDeps.length === 0 ? '依赖黑名单零命中' : `禁用依赖：${hitDeps.join(', ')}`)

// 源码字符串断言：_meta 命名空间 / legacy block adapter 生而废止（§1.4）
const walk = (dir, acc = []) => {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === '.git' || f === 'dist' || f === '.wrangler') continue
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|vue|mjs|js)$/.test(f)) acc.push(p)
  }
  return acc
}
const srcFiles = walk(join(root, 'src'))
const bannedStrings = [
  { s: '_meta', label: '_meta 命名空间（生而废止，台账归模块命名域）' },
  { s: 'legacyBlockAdapter', label: 'legacy block adapter（生而废止）' },
  { s: 'defaultControllerByEra', label: 'defaultControllerByEra（L0-04 升格裁决：不设该字段）' },
]
const bannedHits = []
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8')
  for (const { s, label } of bannedStrings) {
    if (text.includes(s)) bannedHits.push(`${relative(root, f).split(sep).join('/')}: ${label}`)
  }
}
check('TEC-5', bannedHits.length === 0, bannedHits.length === 0 ? '源码禁用字符串零命中（_meta / legacy adapter / defaultControllerByEra）' : bannedHits.join('; '))

// ── SK-00 阶段性目录断言：tests/ 与 baseline/ 就位 ─────────────────
check('TEC-2', existsSync(join(root, 'baseline', 'assertions.json')), 'baseline/assertions.json 副本在位（文档仓为权威）')
// G-8（2026-09-17 拍板行）：副本同源升级为内容级——文档仓可达时逐字节比对；
// 不可达（如 CI 单仓检出）退回存在性检查。防 VS-01 期间「副本被改写未察觉」复发。
{
  const authoritative = join(root, '..', 'rebuild-v2.0', 'baseline', 'assertions.json')
  if (existsSync(authoritative)) {
    const a = readFileSync(authoritative, 'utf8')
    const b = readFileSync(join(root, 'baseline', 'assertions.json'), 'utf8')
    check('TEC-2', a === b, a === b ? 'baseline/assertions.json 与文档仓权威账本逐字节同源（G-8 内容级校验）' : `baseline/assertions.json 与文档仓权威账本不同源（权威 ${a.length} 字符 / 副本 ${b.length} 字符）——跑 ledger --merge 后重新复制副本`)
  }
}

// ── S-02 / S-04 / U-02 侧静态断言（SK-02 起）────────────────────────
// IO 唯一入口：indexedDB / localStorage 只允许出现在 src/stores/（L0–L6 零 IO）
const ioHits = []
for (const f of srcFiles) {
  const rel = relative(root, f).split(sep).join('/')
  const text = readFileSync(f, 'utf8')
  if (!rel.startsWith('src/stores/')) {
    if (/\bindexedDB\b/.test(text)) ioHits.push(`${rel}: indexedDB（S-02 IO 唯一入口 = src/stores/）`)
    if (/\blocalStorage\b/.test(text) && !rel.startsWith('src/components/')) ioHits.push(`${rel}: localStorage（S-02 仅 stores persist 与 L8 UI 偏好）`)
  }
}
check('SAV-2', ioHits.length === 0, ioHits.length === 0 ? 'IO 唯一入口：indexedDB/localStorage 只在 src/stores/（组件侧 UI 偏好除外）' : ioHits.join('; '))

// 唯一库名：全 src 只允许 db.ts 出现 indexedDB.open
const openSites = srcFiles.filter((f) => /indexedDB\.open\s*\(/.test(readFileSync(f, 'utf8')))
check('SAV-2', openSites.length <= 1 && (openSites.length === 0 || relative(root, openSites[0]).split(sep).join('/') === 'src/stores/db.ts'),
  openSites.length <= 1 ? 'indexedDB.open 唯一调用点 = src/stores/db.ts（库名 vicissitudes 唯一）' : `多个 open 调用点：${openSites.map((f) => relative(root, f)).join(', ')}`)

// S-04：settings 默认值只在 settings.ts（禁止组件硬编码默认值）
const settingsDefaultHits = srcFiles.filter((f) => {
  const rel = relative(root, f).split(sep).join('/')
  return !rel.startsWith('src/stores/settings') && /DEFAULT_SETTINGS|turnCallMode:\s*['"]/.test(readFileSync(f, 'utf8'))
})
check('SAV-4', settingsDefaultHits.length === 0,
  settingsDefaultHits.length === 0 ? '设置默认值单点：src/stores/settings.ts（S-04 扩展方式）' : `组件硬编码设置默认值：${settingsDefaultHits.map((f) => relative(root, f)).join(', ')}`)

// U-02 不变量 3：域版本号不进存档 —— SaveRecord 形状不得含版本号字段
const savesSrc = readFileSync(join(root, 'src', 'stores', 'saves.ts'), 'utf8')
check('U-2', !/domainVersions?|versionCounter/.test(savesSrc), 'SaveRecord 形状不含域版本号（U-02 不变量 3：版本号是会话级）')

// ── L-07 豁免面双向登记（注释 ↔ 豁免表；豁免仅覆盖白名单文件）──
const LAYER_007_EXEMPTS = {
  'LAYER-003': ['db.ts', 'persist.ts', 'saveSchema.ts', 'saves.ts', 'settings.ts', 'meta.ts'], // + selectors/{index,runtime,types}.ts（豁免面见 eslint.config.js）
  'LAYER-004': ['compiler.ts', 'TurnRunner.ts', 'monthRunner.ts'],
  'LAYER-005': ['blocks.ts', 'authorize.ts', 'sanitize.ts', 'propose.ts'],
  'LAYER-008': ['client.ts', 'prompt.ts', 'errors.ts', 'turnLoop.ts'],
}
const EXEMPT_DIRS = { 'LAYER-003': 'stores', 'LAYER-004': 'turn', 'LAYER-005': 'parser', 'LAYER-008': 'llm' }
const missingMarks = []
for (const [id, files] of Object.entries(LAYER_007_EXEMPTS)) {
  const dir = join(root, 'src', EXEMPT_DIRS[id])
  const present = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.ts')) : []
  for (const f of files) {
    const p = join(dir, f)
    if (existsSync(p) && !readFileSync(p, 'utf8').includes(`EXEMPT:${id}`)) missingMarks.push(`${id}: ${f}`)
  }
  // 豁免面外文件出现时提示扩展评估（面外文件与豁免面互引会被 lint/graph 拦）
  const outside = present.filter((f) => !files.includes(f))
  if (outside.length > 0) check('LAYER-5', true, `${id} 豁免面外文件（${outside.join(', ')}）——互引仍被 lint/graph 拦截`)
}
check('LAYER-5', missingMarks.length === 0,
  missingMarks.length === 0 ? 'L-07 四组豁免（003 stores/004 turn/005 parser/008 llm）文件均带 EXEMPT 头注（双向登记）' : `缺 EXEMPT 注释：${missingMarks.join(', ')}`)

// ── UI-6 面板注册表一致性（SK-06 起）──────────────────────────────
const panelsDir = join(root, 'src', 'components', 'panels')
const panelFiles = existsSync(panelsDir) ? readdirSync(panelsDir).filter((f) => f.endsWith('.vue')) : []
check('UI-6', panelFiles.length === 11, panelFiles.length === 11 ? '11 面板文件与 U-05 注册表一致（含地图位）' : `面板文件数 ${panelFiles.length} ≠ 11：${panelFiles.join(', ')}`)

// U-03 粗检：面板组件只经 selector 读（禁 import L2/L3/L4 —— 精确层向由 lint 承担，此处查 selector 通道存在性）
const panelsNoSelector = panelFiles.filter((f) => {
  const text = readFileSync(join(panelsDir, f), 'utf8')
  return f !== 'MapPanel.vue' && !text.includes('stores/selectors') && !text.includes('props.state')
})
check('U-3', panelsNoSelector.length === 0, panelsNoSelector.length === 0 ? '面板均经 selector 读通道（U-03 不变量 1）' : `面板缺 selector 通道：${panelsNoSelector.join(', ')}`)

// MOB-05：首屏不进 maplibre（import 图断言）
const maplibreHits = srcFiles.filter((f) => /maplibre/i.test(readFileSync(f, 'utf8')))
check('MOB-5', maplibreHits.length === 0, maplibreHits.length === 0 ? '全仓无 maplibre 引用（地图运行时不进首屏；地图位挂起）' : `maplibre 引用：${maplibreFiles(maplibreHits)}`)

function maplibreFiles(hits) { return hits.map((f) => relative(root, f)).join(', ') }

const deployIssues = staticDeployIssues(root)
check('LLM-40', deployIssues.length === 0, deployIssues.length ? deployIssues.join('; ') : '纯静态部署：无 CF functions/Worker/API 中转入口')

// ── 汇总 ──────────────────────────────────────────────────────────
console.log('── 静态断言（TEC-01 / TEC-02 / TEC-05 / L-04）──')
for (const line of ok) console.log(line)
if (fail.length) {
  for (const line of fail) console.log(line)
  console.log(`[static-checks] FAIL（${fail.length} 项）`)
  process.exit(1)
}
console.log(`[static-checks] PASS（${ok.length} 项全绿）`)
