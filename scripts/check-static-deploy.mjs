#!/usr/bin/env node
// LLM-40 / TEC-03：纯 Pages 静态部署门；历史代理夹具不属于部署入口。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export function staticDeployIssues(root, built = false) {
  const issues = []
  for (const entry of ['functions', '_worker.js', 'public/_worker.js', 'public/functions', 'dist/_worker.js', 'dist/functions']) {
    if (existsSync(join(root, entry))) issues.push(`禁止 CF 动态部署入口：${entry}`)
  }
  for (const entry of ['public/_redirects', 'dist/_redirects']) {
    const p = join(root, entry)
    if (existsSync(p) && readFileSync(p, 'utf8').split(/\r?\n/).some((line) => /^\s*\/api(?:[/*\s]|$)/.test(line))) {
      issues.push(`禁止恢复模型代理重定向：${entry}`)
    }
  }
  function inspect(dir) {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) inspect(p)
      else if (/\.(ts|js|vue)$/.test(name)) {
        const text = readFileSync(p, 'utf8')
        if (/['"`]\/api\/(?:chat|models)(?:['"`/?]|$)/.test(text)
          || /x-vic-upstream-key/i.test(text) || /mode\s*:\s*['"]no-cors['"]/.test(text)) {
          issues.push(`生产源码含旧中转/不透明请求：${relative(root, p)}`)
        }
      }
    }
  }
  inspect(join(root, 'src'))
  if (built && !existsSync(join(root, 'dist', 'index.html'))) issues.push('缺少 dist/index.html；先运行生产构建')
  return issues
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const issues = staticDeployIssues(root, process.argv.includes('--built'))
  if (issues.length) {
    for (const issue of issues) console.error(`[static-deploy] FAIL ${issue}`)
    process.exitCode = 1
  } else console.log('[static-deploy] PASS — 仅静态资源；无 CF 模型中转入口')
}
