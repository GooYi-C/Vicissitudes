// 层表单一事实源（§十六 L-01 八层分层表）。
// eslint.config.js（L-06 规则族）与 scripts/graph-check.mjs（L-03 快照）都从这里取层定义，
// 不手写第二份 —— 双份表必然漂移（L-06 不变量 1）。
// 「是否改层」= 改本文件 + REBUILD.md §十六 L-01 + L-05 归属表，三处同改才算加层。

export const LAYERS = [
  { n: 0, id: 'L0', name: 'data', dirs: ['src/data'] },
  { n: 1, id: 'L1', name: 'validation', dirs: ['src/validation'] },
  { n: 2, id: 'L2', name: 'engine', dirs: ['src/engine'] },
  { n: 3, id: 'L3', name: 'orchestration', dirs: ['src/orchestration'] },
  { n: 4, id: 'L4', name: 'turn', dirs: ['src/turn'] },
  { n: 5, id: 'L5', name: 'gameCommands', dirs: ['src/gameCommands'] },
  { n: 6, id: 'L6', name: 'llm+parser', dirs: ['src/llm', 'src/parser'] },
  { n: 7, id: 'L7', name: 'stores', dirs: ['src/stores'] },
  { n: 8, id: 'L8', name: 'components', dirs: ['src/components'] },
]

// L-01 不变量 2：表外路径不属任何层，但不得被 src/ 反向 import
export const OUTSIDE_PATHS = ['functions', 'tests', 'tools', 'scripts']

// TEC-02 不变量：src/ 顶层只允许组合根文件 + 层目录，不出现表外顶层目录
export const SRC_ROOT_FILES = ['main.ts', 'App.vue', 'vite-env.d.ts']
export const SRC_ROOT_DIRS = LAYERS.flatMap((l) => l.dirs.map((d) => d.slice('src/'.length)))

export function layerOf(posixPath) {
  for (const layer of LAYERS) {
    for (const dir of layer.dirs) {
      if (posixPath === dir || posixPath.startsWith(`${dir}/`)) return layer
    }
  }
  return null
}
