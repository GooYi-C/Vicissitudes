// eslint.config.js — 分层守卫（§十六 L-06 规则族）
// zones 由 scripts/layers.mjs 的层表生成，不手写第二份层次矩阵（L-06 不变量 1）。
// 每条规则的报错信息带契约 ID，便于直接回查 REBUILD.md 对应条目（L-06 不变量 2）。
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'
import { LAYERS, OUTSIDE_PATHS } from './scripts/layers.mjs'

// LAYER-003 豁免（§十六 L-07 豁免表，2026-09-15 登记，与文档仓豁免表双向登记）：
// L7 stores 内部组合（db/persist/saveSchema/saves/settings/meta 六文件）互引不属 L-02 立法本意
// （L-02 约束的是 L2 引擎模块运行时信息流）。豁免清单的机器登记点 =
// scripts/static-checks.mjs（LAYER-5 断言：六文件头注 EXEMPT:LAYER-003 + 面外文件出现即提示扩展）。
// 失效条件：stores 拆层或 persist 并入单文件。

function layerZones() {
  const zones = []
  const push = (target, from, message) => zones.push({ target: `./${target}`, from: `./${from}`, message })
  for (const layer of LAYERS) {
    // L-02 同层零 import（L0 豁免：无状态、无顺序语义）
    if (layer.n !== 0) {
      for (const t of layer.dirs) {
        for (const f of layer.dirs) {
          if (layer.n === 7) {
            // LAYER-003 豁免（§十六 L-07 豁免表，2026-09-15 登记）：
            // L7 stores 内部组合（db/persist/saveSchema/saves/settings/meta 六文件）互引不属 L-02
            // 立法本意（L-02 约束 L2 引擎模块运行时信息流）。
            // L7 同层 zone 只对「豁免面外文件」生效：豁免六文件互引不生成 zone；
            // 面外文件（selectors/* 等）与任何 stores 文件互引由 static-checks 的
            // LAYER-003 双向登记断言拦截（scripts/static-checks.mjs）。
            // 失效条件：stores 拆层或 persist 并入单文件。
            continue
          }
          push(t, f, `L-02 同层零 import（§十六）：${t} ↔ ${f} 之间信息只能经 TickContext 与状态树传递`)
        }
      }
    }
    // L-01 单向依赖：目标层号 ≤ 自身层号
    for (const higher of LAYERS) {
      if (higher.n <= layer.n) continue
      for (const t of layer.dirs) {
        for (const f of higher.dirs) {
          push(t, f, `L-01 单向依赖（§十六）：${t}（L${layer.n}）不得 import ${f}（L${higher.n}）`)
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
