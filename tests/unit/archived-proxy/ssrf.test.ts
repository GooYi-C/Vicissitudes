// 历史代理回归（归档）：只检验历史夹具，不作为浏览器直连/纯静态生产验收。
import { describe, it, expect } from 'vitest'
import { checkUrl, checkResolvedIp, isBlockedIPv4, isBlockedIPv6 } from '../../fixtures/cf-proxy/_lib/ssrf'

// LLM-9：代理 SSRF 白名单样本全灭（私网/回环/元数据 169.254.169.254/重定向/非 https/file:）
describe('LL-10 SSRF 判定表（LLM-9 样本全灭）', () => {
  const blocked = [
    // 私网与保留段（规则 2）
    'https://10.0.0.5/v1',
    'https://192.168.1.1/v1',
    'https://172.16.0.1/v1',
    'https://172.31.255.255/v1',
    'https://169.254.169.254/latest/meta-data', // 云元数据端点
    'https://169.254.170.2/v2/credentials',
    'https://100.64.0.1/v1', // CGNAT
    'https://0.0.0.0/v1',
    'https://224.0.0.1/v1', // multicast
    'https://255.255.255.255/v1',
    'https://[fd00::1]/v1', // IPv6 ULA
    'https://[fe80::1]/v1', // IPv6 link-local
    'https://[::1]/v1', // IPv6 loopback
    'https://[::]/v1',
    'https://[::ffff:127.0.0.1]/v1', // IPv4-mapped loopback
    // 非 HTTP(S) 协议（规则 4）
    'file:///etc/passwd',
    'gopher://127.0.0.1:6379/_INFO',
    'data:text/html,hello',
    'ftp://example.com/file',
    // http 非本机（规则 1）
    'http://example.com/v1',
    'http://192.168.1.1/v1',
    // 内部主机名（.localhost 子域 / .internal；localhost 本体是本机模型例外）
    'https://db.internal/v1',
    'https://svc.localhost/v1',
  ]
  for (const url of blocked) {
    it(`拒：${url}`, () => {
      expect(checkUrl(url).ok).toBe(false)
    })
  }

  const allowed = [
    'https://api.openai.com/v1',
    'https://api.deepseek.com/v1',
    'https://my-proxy.example.com/v1',
    'http://localhost:11434/v1', // 本机模型（Ollama）——唯一 http 例外（初值）
    'http://127.0.0.1:8080/v1',
    'https://localhost:11434/v1', // https + localhost 同属本机例外
    'https://8.8.8.8/v1', // 公网 IP 字面量
  ]
  for (const url of allowed) {
    it(`放：${url}`, () => {
      expect(checkUrl(url).ok).toBe(true)
    })
  }

  it('规则 5：DoH 解析出的私网 IP 一律拒（DNS rebinding 防护）', () => {
    expect(checkResolvedIp('10.0.0.7').ok).toBe(false)
    expect(checkResolvedIp('169.254.169.254').ok).toBe(false)
    expect(checkResolvedIp('93.184.216.34').ok).toBe(true)
    expect(checkResolvedIp('not-an-ip').ok).toBe(false)
  })

  it('IP 判定器独立可测（私有/保留段枚举完整）', () => {
    expect(isBlockedIPv4('10.1.2.3')).toBe(true)
    expect(isBlockedIPv4('172.20.1.1')).toBe(true)
    expect(isBlockedIPv4('172.32.1.1')).toBe(false) // 172.32 不在 /12 内
    expect(isBlockedIPv4('192.169.1.1')).toBe(false) // 192.169 不在 /16 内
    expect(isBlockedIPv4('8.8.8.8')).toBe(false)
    expect(isBlockedIPv6('fc00::1')).toBe(true)
    expect(isBlockedIPv6('2606:4700::1111')).toBe(false)
  })

  it('畸形输入宁拒勿猜', () => {
    expect(checkUrl('not a url').ok).toBe(false)
    expect(checkUrl('').ok).toBe(false)
  })
})
