// L1 纯函数：云 API URL 形状校验/路由拼接；不做 DNS 查询、不声称能固定浏览器连接 IP。
export type ProviderRoute = 'chat/completions' | 'models'
export type ProviderEndpoint = { ok: true; url: string } | { ok: false; code: 'bad-request' | 'blocked-upstream' }

export function providerEndpoint(baseUrl: string, route: ProviderRoute, applicationOrigin?: string): ProviderEndpoint {
  const input = baseUrl.trim()
  if (!input || /[\s\u0000-\u001f\u007f]/.test(input)) return { ok: false, code: 'bad-request' }
  let url: URL
  try { url = new URL(input) } catch { return { ok: false, code: 'bad-request' } }
  if (url.protocol !== 'https:' || url.username || url.password || input.includes('?') || input.includes('#')) {
    return { ok: false, code: 'blocked-upstream' }
  }
  const host = url.hostname.toLowerCase()
  // 云端模式只接受域名；URL 会先规范化十进制/十六进制等 IPv4 写法，再统一拒绝。
  if (host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)
    || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(host)
    || /(^|\.)(localhost|local|internal|lan|home|test)$/.test(host) || host.endsWith('.home.arpa')) {
    return { ok: false, code: 'blocked-upstream' }
  }
  if (applicationOrigin) {
    try {
      if (url.origin === new URL(applicationOrigin).origin) return { ok: false, code: 'blocked-upstream' }
    } catch { return { ok: false, code: 'bad-request' } }
  }
  // baseUrl 必须包含服务商实际版本路径；不猜 /v1。也接受完整 chat/models URL。
  let path = url.pathname.replace(/\/+$/, '')
  path = path.replace(/\/(chat\/completions|models)$/, '')
  url.pathname = `${path}/${route}`
  return { ok: true, url: url.toString() }
}
