// functions/_lib/ssrf.ts — 地址判定（§二十 LL-10 SSRF 防护五规则）
// 纯函数，无游戏逻辑（TEC-03 不变量 2）；被 api/chat.ts 消费。
// 规则 1：仅 https；http 仅允许 localhost/127.0.0.1（本机模型，初值）
// 规则 2：解析后 IP 禁私网与保留段（RFC1918/link-local/CGNAT/ULA/0.0.0.0/元数据端点）
// 规则 3：禁重定向跟随（由 fetch 侧 redirect:'manual' 承担；本模块给出判定函数）
// 规则 4：禁非 HTTP(S) 协议
// 规则 5：DNS rebinding 防护 —— 判定用解析结果 IP，连接也用同一 IP（由 chat.ts + doh.ts 落实）

export interface SsrfVerdict {
  ok: boolean
  reason?: 'scheme' | 'host' | 'ip'
  detail?: string
}

// IPv4 字面量 → number（无效返回 null）
function ipv4ToLong(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

export function isIPv4(s: string): boolean {
  return ipv4ToLong(s) !== null
}

export function isIPv6(s: string): boolean {
  return s.includes(':')
}

// 私网与保留段判定（LL-10 规则 2 的完整枚举）
export function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToLong(ip)
  if (n === null) return true // 解析失败视为阻塞（宁拒勿猜）
  const inRange = (cidr: string, bits: number) => {
    const base = ipv4ToLong(cidr)!
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (n & mask) === (base & mask)
  }
  return (
    inRange('0.0.0.0', 8) || // 0.0.0.0/8「本网络」
    inRange('10.0.0.0', 8) || // RFC1918 A
    inRange('100.64.0.0', 10) || // CGNAT 100.64/10
    inRange('127.0.0.0', 8) || // loopback（http 本机例外在 URL 层处理，IP 层一律标记）
    inRange('169.254.0.0', 16) || // link-local（含 169.254.169.254 元数据端点）
    inRange('172.16.0.0', 12) || // RFC1918 B
    inRange('192.0.0.0', 24) || // IETF protocol assignments
    inRange('192.0.2.0', 24) || // TEST-NET-1
    inRange('192.88.99.0', 24) || // 6to4 relay anycast（退役）
    inRange('192.168.0.0', 16) || // RFC1918 C
    inRange('198.18.0.0', 15) || // benchmark
    inRange('198.51.100.0', 24) || // TEST-NET-2
    inRange('203.0.113.0', 24) || // TEST-NET-3
    inRange('224.0.0.0', 4) || // multicast
    inRange('240.0.0.0', 4) // reserved（含 255.255.255.255 广播）
  )
}

// IPv6：ULA（fc00::/7）、link-local（fe80::/10）、loopback（::1）、未指定（::）、IPv4-mapped、multicast
export function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // ULA fc00::/7
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true // fe80::/10
  // IPv4-mapped：::ffff:a.b.c.d（点分）或 ::ffff:7f00:1（URL 规范化后的 hex）——还原为 IPv4 再判
  const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) return isBlockedIPv4(dotted[1])
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    const ipv4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
    return isBlockedIPv4(ipv4)
  }
  if (lower.startsWith('ff')) return true // multicast
  return false
}

// URL 结构判定：协议 + 主机名形态（IP 字面量直接判；域名交由 DoH 解析后再判 —— 规则 5）
export function checkUrl(rawUrl: string): SsrfVerdict {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'scheme', detail: 'URL 无法解析' }
  }
  const host = u.hostname.replace(/^\[|\]$/g, '')
  // 本机例外（初值，LL-10 规则 1）：仅 http 协议下的 localhost / 127.0.0.1 / [::1]。
  // https + loopback 一律按保留段拒（云上 https 直连 loopback 多为 SSRF 隧道特征，保守拒）。
  const isLocalhost = host === 'localhost' || host === '::1' || host === '127.0.0.1'

  // 规则 4：禁非 HTTP(S) 协议（file:/gopher:/data:/ftp: 一律拒）
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, reason: 'scheme', detail: `协议不被允许：${u.protocol}` }
  }
  // 规则 1：http 仅允许本机（localhost / 127.0.0.1 / [::1]，初值）
  if (u.protocol === 'http:') {
    if (isLocalhost) return { ok: true }
    return { ok: false, reason: 'scheme', detail: 'http 仅允许本机（localhost/127.0.0.1/[::1]）' }
  }
  // https：loopback / ULA / link-local 一律按保留段拒（含 ::1、::ffff:127.0.0.1）
  if (host === 'localhost' && u.protocol === 'https:') {
    return { ok: true } // https + localhost：本机例外（非隧道形态）
  }
  // 规则 2：IP 字面量直接判定
  if (isIPv4(host) && isBlockedIPv4(host)) return { ok: false, reason: 'ip', detail: `IP 在保留/私网段：${host}` }
  if (isIPv6(host) && isBlockedIPv6(host)) return { ok: false, reason: 'ip', detail: `IP 在保留/私网段：${host}` }
  if (host.endsWith('.localhost') || host.endsWith('.internal')) {
    return { ok: false, reason: 'host', detail: `主机名指向内部：${host}` }
  }
  // 域名：由调用方经 DoH 解析后用 checkResolvedIp 复判（规则 5：判定与连接同源）
  return { ok: true }
}

// 规则 5 后半：DoH 解析出的每个 IP 都必须通过保留段判定，且连接用同一 IP
export function checkResolvedIp(ip: string): SsrfVerdict {
  if (isIPv4(ip)) return isBlockedIPv4(ip) ? { ok: false, reason: 'ip', detail: `解析 IP 在保留/私网段：${ip}` } : { ok: true }
  if (isIPv6(ip)) return isBlockedIPv6(ip) ? { ok: false, reason: 'ip', detail: `解析 IP 在保留/私网段：${ip}` } : { ok: true }
  return { ok: false, reason: 'ip', detail: `非 IP 字面量：${ip}` }
}
