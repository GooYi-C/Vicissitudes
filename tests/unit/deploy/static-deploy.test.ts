// LLM-40：临时目录中检验部署入口闸；不修改真实代码仓，不发请求。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { staticDeployIssues } from '../../../scripts/check-static-deploy.mjs'

const roots: string[] = []
function root() { const p = mkdtempSync(join(tmpdir(), 'vic-static-test-')); roots.push(p); return p }
function file(base: string, name: string, content = '') {
  const path = join(base, name)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }) })

describe('LLM-40 纯静态部署门', () => {
  it('允许静态产物与不部署的历史夹具', () => {
    const p = root()
    file(p, 'dist/index.html', '<html>ok</html>')
    file(p, 'src/llm/client.ts', 'fetch(endpoint, { mode: "cors" })')
    file(p, 'tests/fixtures/cf-proxy/api/chat.ts', 'export const onRequest = () => {}')
    expect(staticDeployIssues(p, true)).toEqual([])
  })
  it.each(['functions/api/chat.ts', 'public/_worker.js', '_worker.js', 'dist/_worker.js', 'dist/functions/api/chat.js'])('阻止动态入口复活 %s', (name) => {
    const p = root(); file(p, name, 'export default {}')
    expect(staticDeployIssues(p).length).toBeGreaterThan(0)
  })
  it.each(['public/_redirects', 'dist/_redirects'])('阻止模型代理重定向 %s', (name) => {
    const p = root(); file(p, name, '/api/* https://relay.example.com/:splat 302')
    expect(staticDeployIssues(p).length).toBeGreaterThan(0)
  })
  it.each([
    'fetch("/api/chat")', 'fetch("/api/models")',
    'fetch(url, { mode: "no-cors" })', 'const header = "x-vic-upstream-key"',
  ])('阻止生产代码恢复旧中转/不透明访问 %#', (content) => {
    const p = root(); file(p, 'src/llm/client.ts', content)
    expect(staticDeployIssues(p).length).toBeGreaterThan(0)
  })
  it('部署前必须已有 index.html，不能把未构建目录当成通过', () => {
    expect(staticDeployIssues(root(), true)).toContain('缺少 dist/index.html；先运行生产构建')
  })
})
