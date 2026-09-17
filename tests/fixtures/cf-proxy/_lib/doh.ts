// 历史 CF 代理测试夹具：不属于部署入口，不代表现网能力或安全验收。
// functions/_lib/doh.ts — DoH 解析链（§二十 LL-11）
// 三解析器顺序尝试：dns.google → cloudflare-dns.com → 系统 DNS 兜底。
// 短 TTL 缓存（60s 初值）；全部失败 → 系统 DNS 兜底 ＋ 注记（降级，不是拒绝请求）。
// 用途：LL-10 规则 5 —— 判定用解析结果 IP，连接也用同一 IP（防 DNS rebinding）。

const RESOLVERS = ['https://dns.google/resolve', 'https://cloudflare-dns.com/dns-query'] as const

// 轻量 TTL 缓存（进程内；Workers 实例生命周期即缓存生命周期，符合「短 TTL」意图）
const cache = new Map<string, { ips: string[]; at: number }>()
const TTL_MS = 60_000

export interface DohResult {
  ips: string[]
  via: 'doh' | 'system'
  note?: string
}

async function queryResolver(url: string, name: string): Promise<string[]> {
  const res = await fetch(`${url}?name=${encodeURIComponent(name)}&type=A`, {
    headers: { accept: 'application/dns-json' },
  })
  if (!res.ok) throw new Error(`DoH ${url} → ${res.status}`)
  const json = (await res.json()) as { Answer?: { type: number; data: string }[] }
  return (json.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data)
}

export async function resolveHost(name: string): Promise<DohResult> {
  const hit = cache.get(name)
  if (hit && Date.now() - hit.at < TTL_MS) return { ips: hit.ips, via: 'doh' }

  for (const url of RESOLVERS) {
    try {
      const ips = await queryResolver(url, name)
      if (ips.length > 0) {
        cache.set(name, { ips, at: Date.now() })
        return { ips, via: 'doh' }
      }
    } catch {
      // 链上继续尝试下一解析器（LLM-21：前两失败 → 第三成功；本链为前两位）
    }
  }
  // 系统 DNS 兜底（Cloudflare Workers 无 Node dns；用 connect() 的解析不可直接用，
  // 此处以「仅域名连接」作为兜底形态并注记 —— 判定侧已在 URL 层排除字面量保留段）
  return { ips: [], via: 'system', note: 'DoH 全失败，系统 DNS 兜底（注记）' }
}
