// eslint.config.js — 分层守卫（§十六 L-06 规则族）
// zones 由 scripts/layers.mjs 的层表生成，不手写第二份层次矩阵（L-06 不变量 1）。
// 每条规则的报错信息带契约 ID，便于直接回查 REBUILD.md 对应条目（L-06 不变量 2）。
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'
import { readdirSync, existsSync } from 'node:fs'
import { LAYERS, OUTSIDE_PATHS } from './scripts/layers.mjs'



// LAYER-003 豁免（§十六 L-07 豁免表，2026-09-15 登记，与文档仓豁免表双向登记）：
// L7 stores 内部组合（db/persist/saveSchema/saves/settings/meta 六文件）互引不属 L-02 立法本意
// （L-02 约束的是 L2 引擎模块运行时信息流）。豁免清单的机器登记点 =
// scripts/static-checks.mjs（LAYER-5 断言：六文件头注 EXEMPT:LAYER-003 + 面外文件出现即提示扩展）。
// 失效条件：stores 拆层或 persist 并入单文件。

// L-07 豁免面（§十六 L-07 豁免表，2026-09-15 登记，与文档仓豁免表双向登记）：
// LAYER-003 L7 stores 内部组合；LAYER-004 L4 turn 管线两半（compiler/TurnRunner）；
// LAYER-005 L6 parser 意图链三段（blocks/authorize/sanitize；2026-09-17 VS-01 拓面 propose.ts——提议与意图同链）。
// LAYER-008（2026-09-17 拍板 B 登记）L6 llm 组合模块组：client/prompt/errors/turnLoop——LLM 适配与回合链。
// 共同理由：均为「单一职责模块的内部组合」，非 L2 引擎模块运行时信息传递（L-02 立法本意）。
// 豁免仅覆盖白名单文件；各层新增职责外文件互引仍被拦。失效条件见豁免表各行。
const LAYER_EXEMPT = new Set([
  // LAYER-003
  'src/stores/db.ts', 'src/stores/persist.ts', 'src/stores/saveSchema.ts',
  'src/stores/saves.ts', 'src/stores/settings.ts', 'src/stores/meta.ts',
  'src/stores/selectors/index.ts', 'src/stores/selectors/runtime.ts', 'src/stores/selectors/types.ts',
  // LAYER-004
  'src/turn/compiler.ts', 'src/turn/TurnRunner.ts', 'src/turn/monthRunner.ts',
  // LAYER-005
  'src/parser/blocks.ts', 'src/parser/authorize.ts', 'src/parser/sanitize.ts', 'src/parser/propose.ts',
  // LAYER-008
  'src/llm/client.ts', 'src/llm/prompt.ts', 'src/llm/errors.ts', 'src/llm/turnLoop.ts',
])

// LAYER-006（单向豁免，§十六 L-07 豁免表 2026-09-15 登记）：
// engine 模块 → engine/types.ts（EngineModule/TickContext 接口定义处 —— M-01/L-05 明示意）；
// engine/registry.ts 为聚合 hub（M-06 单一权威数组 —— 注册表必然 import 全部模块）。
// 模块↔模块互引仍禁；types/registry → 模块的反向依赖仅 registry 合法（聚合本体）。
// R1 追加（2026-09-15）：settlement → trade 单向豁免 —— trade.ts 的 routeEconomics
// 是 M-11 库层条目（口径出口：L1 公式 + L0 数据的绑定，纯函数、无状态、不注册），
// settlement 为唯一调用方（§9.6「消费 ctx.market 与 trade 口径一致」的结构保证）。
// 模块间「信息」仍只经 TickContext 与状态树 —— 本豁免只放行口径函数，不放行状态读取。
const LAYER_006_HUBS = new Set(['src/engine/types.ts', 'src/engine/registry.ts'])
// 库出口单向豁免对（from → to：from 是调用方模块，to 是库出口宿主文件）
const LAYER_006_LIB_EXITS = new Set(['src/engine/settlement.ts→src/engine/trade.ts'])

// LAYER-007（单向豁免，§十六 L-07 豁免表 2026-09-15 登记）：
// L0 数据文件 → L1 dataSchemas.ts（D-04「建表先建 schema」—— 数据 import 自己的 schema 自校验）
// 反向（validation → data）仍禁。
const LAYER_007_TARGETS = new Set(['src/validation/dataSchemas.ts', 'src/validation/stableJson.ts'])

function layerZones() {
  const zones = []
  const push = (target, from, message) => zones.push({ target: `./${target}`, from: `./${from}`, message })
  // 列出某目录下的 .ts 文件（豁免面文件级判定需要；目录不存在返回空）
  for (const layer of LAYERS) {
    // L-02 同层零 import（L0 豁免：无状态、无顺序语义）
    if (layer.n !== 0) {
      for (const dir of layer.dirs) {
        const files = existsSync(dir)
          ? readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).map((f) => `${dir}/${f}`)
          : []
        for (const t of files) {
          for (const f of files) {
            if (t === f) continue
            // L-07 豁免（组合内部互引）：stores/turn/parser 白名单对
            if (LAYER_EXEMPT.has(t) && LAYER_EXEMPT.has(f)) continue
            // LAYER-006 单向豁免：模块 → types.ts/registry.ts（接口处与聚合 hub）；
            // registry → 模块（聚合本体 —— M-06 单一权威数组必然 import 全部模块）
            if (LAYER_006_HUBS.has(f)) continue
            if (t === 'src/engine/registry.ts') continue
            // LAYER-006 库出口单向豁免（M-11）：调用方模块 → 库出口宿主（如 settlement → trade.routeEconomics）
            if (LAYER_006_LIB_EXITS.has(`${t}→${f}`)) continue
            push(t, f, `L-02 同层零 import（§十六）：${t} ↔ ${f} 之间信息只能经 TickContext 与状态树传递`)
          }
        }
      }
    }
    // L-01 单向依赖：目标层号 ≤ 自身层号
    for (const higher of LAYERS) {
      if (higher.n <= layer.n) continue
      for (const t of layer.dirs) {
        for (const f of higher.dirs) {
          if (layer.n === 0) {
            // L0 源侧：数据文件 → L1 仅 dataSchemas 合法（LAYER-007 建表先建 schema）。
            // zone 用文件×文件矩阵：dataSchemas 目标不生成；其余 L1 文件全拦。
            const l0Files = existsSync(t)
              ? readdirSync(t).filter((x) => x.endsWith('.ts') && !x.endsWith('.d.ts')).map((x) => `${t}/${x}`)
              : []
            const l1Files = existsSync(f)
              ? readdirSync(f).filter((x) => x.endsWith('.ts') && !x.endsWith('.d.ts')).map((x) => `${f}/${x}`)
              : []
            for (const lf of l0Files) {
              for (const tf of l1Files) {
                if (LAYER_007_TARGETS.has(tf)) continue // LAYER-007：数据→schema/序列化工具 单向豁免
                push(lf, tf, `L-01 单向依赖（§十六）：${lf}（L0）不得 import ${tf}（L1）——数据文件仅可 import dataSchemas（LAYER-007）`)
              }
            }
            continue
          }
          // 目标侧文件级（豁免判定需要具体文件）：枚举目标层文件生成 zone
          const targetFiles = existsSync(f)
            ? readdirSync(f).filter((x) => x.endsWith('.ts') && !x.endsWith('.d.ts')).map((x) => `${f}/${x}`)
            : []
          if (targetFiles.length > 0) {
            for (const tf of targetFiles) {
              if (layer.n === 0 && tf === LAYER_007_SCHEMA) continue // LAYER-007
              push(t, tf, `L-01 单向依赖（§十六）：${t}（L${layer.n}）不得 import ${tf}（L${higher.n}）`)
            }
          } else {
            push(t, f, `L-01 单向依赖（§十六）：${t}（L${layer.n}）不得 import ${f}（L${higher.n}）`)
          }
        }
      }
    }
  }
  // L-01 不变量 2：src/ 不得反向 import 表外路径
  for (const outside of OUTSIDE_PATHS) {
    push('src', outside, `L-01 不变量 2（§十六）：src/ 不得反向 import 表外路径 ${outside}/`)
  }
  return zones
}

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.wrangler/**', 'coverage/**', 'pnpm-lock.yaml'] },
  ...pluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  {
    // .vue 文件：vue-eslint-parser 解析 SFC，script 块交给 @typescript-eslint/parser
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, sourceType: 'module' },
    },
  },
  {
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['tsconfig.app.json'],
        },
      },
    },
    plugins: { 'import-x': importX },
    rules: {
      'import-x/no-restricted-paths': ['error', { zones: layerZones() }],
      'import-x/no-cycle': ['error'],
    },
  },
  {
    // L-06：引擎/编排层禁自造时源与随机源（§十九 B-02 / ARC-6）
    files: ['src/engine/**/*.ts', 'src/orchestration/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'B-02/ARC-6（§十九）：时间源只能取自 TickContext（ctx.date / ctx.monthIndex）',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'B-02/ARC-6（§十九）：随机源只能取自 ctx.rng(salt) 派生',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'B-02（§十九）：引擎/编排层禁 new Date()，时源取自 ctx.date',
        },
      ],
    },
  },
  {
    // L-06：L0/L1 禁动态 import（§十七 D-03 —— 构建期静态可解析是内容包 hash 的前提）
    files: ['src/data/**/*', 'src/validation/**/*'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.type="ImportExpression"]',
          message: 'L-06（§十六）：L0/L1 禁动态 import —— 内容包 hash 计算要求构建期静态可解析',
        },
      ],
    },
  },
)
