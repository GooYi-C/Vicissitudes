// @vitest-environment happy-dom
// LLM-36 / BIL-7：DOM 自动化证据，不能冒充人工浏览器 L3。网络全部替换为离线桩。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App as VueApp } from 'vue'
import App from '../../../src/App.vue'
import { loadSettings, saveSettings } from '../../../src/stores/settings'
import { writeSave } from '../../../src/stores/saves'
import { getCallStats, resetCallStats } from '../../../src/llm/client'

vi.mock('../../../src/stores/saves', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/stores/saves')>()
  return { ...actual, readSave: vi.fn(async () => null), writeSave: vi.fn(async () => {}) }
})
vi.mock('../../../src/components/OpeningDossier.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({
    emits: ['start'],
    setup(_props, { emit }) {
      return () => h('button', { 'data-testid': 'fixture-start', onClick: () => emit('start', 'era-warlord', 'student') }, '测试开局')
    },
  }) }
})

const secret = 'sk-local-test-never-export'
const response = () => {
  const enc = new TextEncoder()
  const text = 'data: {"choices":[{"delta":{"content":"这是测试叙事，不应导出。"}}]}\n\n'
    + 'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":80}}}\n\n'
    + 'data: [DONE]\n\n'
  let sent = false
  return { ok: true, status: 200, body: { getReader: () => ({ read: async () => {
    if (sent) return { done: true, value: undefined }
    sent = true
    return { done: false, value: enc.encode(text) }
  } }) } } as unknown as Response
}
const fetchMock = vi.fn(async () => response())
let app: VueApp | undefined
let host: HTMLDivElement

beforeEach(async () => {
  localStorage.clear()
  resetCallStats()
  vi.mocked(writeSave).mockClear()
  fetchMock.mockReset().mockImplementation(async () => response())
  vi.stubGlobal('fetch', fetchMock)
  host = document.createElement('div')
  document.body.appendChild(host)
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host.remove()
  vi.unstubAllGlobals()
})

async function mountGame(withApi = true) {
  const { settings } = await loadSettings()
  settings.upstream = withApi
    ? { baseUrl: 'https://fixture.example/v1', model: 'fixture-model', apiKey: secret }
    : { baseUrl: '', model: '', apiKey: '' }
  await saveSettings(settings)
  app = createApp(App)
  app.mount(host)
  await nextTick()
  ;(host.querySelector('[data-testid="fixture-start"]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(host.querySelector('[data-testid="call-counter"]')).not.toBeNull())
  await vi.waitFor(() => expect(writeSave).toHaveBeenCalled())
}
function submit() {
  const input = host.querySelector('input[aria-label="行动输入"]') as HTMLInputElement
  input.value = '私人验收输入，不应出现在观测导出'
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}
function observation() {
  return JSON.parse((host.querySelector('textarea[aria-label="验收观测 JSON"]') as HTMLTextAreaElement).value)
}

describe('LLM-36 设置区实时观测与隐私边界', () => {
  it('首次渲染为 0，回合完成后自动变为 1，真实 usage 与未测费用分开显示', async () => {
    await mountGame()
    expect(observation().summary.calls).toBe(0)
    expect(observation().summary.promptTokens).toBeNull()
    submit()
    await vi.waitFor(() => expect(observation().summary.calls).toBe(1))
    expect(observation().summary).toMatchObject({ promptTokens: 100, completionTokens: 20, cacheTokenRatio: 0.8 })
    expect(observation().cost.status).toBe('unmeasured')
    expect(host.querySelector('[data-testid="usage-summary"]')?.textContent).toContain('80.00%')
    expect(observation().turns[0]).toMatchObject({ ordinal: 1, firstCall: 1, lastCall: 1, status: 'ok', committed: true })
    expect(observation().turns[0].staticHeadHash).toMatch(/^[0-9a-f]{8}$/)
    const json = JSON.stringify(observation())
    for (const forbidden of [secret, 'fixture.example', '私人验收输入', '这是测试叙事']) expect(json).not.toContain(forbidden)
    // 写入存档仍只包含原有 SaveRecord；观测数据不附着在存档或提示词中。
    const saves = JSON.stringify(vi.mocked(writeSave).mock.calls)
    expect(saves).not.toContain(secret)
    expect(saves).not.toContain('usageComplete')
    expect(saves).not.toContain('vs01-observation-v2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('免 API 输入仍只过月，观测读取不引入网络、usage 或调用计数', async () => {
    await mountGame(false)
    submit()
    await nextTick()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getCallStats()).toHaveLength(0)
    expect(observation().summary).toMatchObject({ calls: 0, promptTokens: null, cacheTokenRatio: null })
    expect(observation().turns).toEqual([])
  })

  it('请求尚未结束时重复提交不产生并发付费调用；完成后输入恢复', async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done }))
    await mountGame()
    submit()
    submit()
    await nextTick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((host.querySelector('input[aria-label="行动输入"]') as HTMLInputElement).disabled).toBe(true)
    resolve(response())
    await vi.waitFor(() => expect(observation().summary.calls).toBe(1))
    expect((host.querySelector('input[aria-label="行动输入"]') as HTMLInputElement).disabled).toBe(false)
  })

  it('LL-19 auth 降级仍沿既有规则过月，不把请求失败记成成功 usage/模型提交', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'auth' } }) }) as unknown as Response)
    await mountGame()
    submit()
    await vi.waitFor(() => expect(observation().summary.calls).toBe(1))
    expect(observation().turns[0]).toMatchObject({ status: 'auth', committed: false, metrics: null })
    expect(observation().summary.promptTokens).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(vi.mocked(writeSave).mock.calls.length).toBeGreaterThan(1))
    const saves = vi.mocked(writeSave).mock.calls
    expect(saves[saves.length - 1][0].variables.world.date).toBe('1921-08')
  })

  it('直连说明可见，模型列表仅点击时请求，不计入生成次数', async () => {
    await mountGame()
    expect(host.querySelector('[data-testid="direct-notice"]')?.textContent).toContain('CF 仅提供静态页面')
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'model-a' }, { id: secret }] }) }) as unknown as Response)
    ;(host.querySelector('[data-testid="load-models"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(host.querySelector('[data-testid="models-note"]')?.textContent).toContain('已读取 1 个模型'))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://fixture.example/v1/models')
    expect(init).toMatchObject({ method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error' })
    expect(observation().summary.calls).toBe(0)
    expect(observation().transport).toBe('browser-direct')
    expect(host.querySelectorAll('#vic-provider-models option')).toHaveLength(1)
  })

  it('网络/CORS 失败有可见提示，不暗中转 CF 重试', async () => {
    await mountGame()
    fetchMock.mockImplementationOnce(async () => { throw new TypeError('CORS failure ' + secret) })
    submit()
    await vi.waitFor(() => expect(observation().summary.calls).toBe(1))
    expect(observation().turns[0].status).toBe('network-or-cors')
    expect(host.textContent).toContain('不会转由 CF 代理')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(observation())).not.toContain(secret)
  })


  it('LLM-41 过月存档未完成不解锁下一动作，避免刷新读回旧月份', async () => {
    await mountGame(false)
    vi.mocked(writeSave).mockClear()
    let finish!: () => void
    vi.mocked(writeSave).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    submit()
    await nextTick()
    expect((host.querySelector('input[aria-label="行动输入"]') as HTMLInputElement).disabled).toBe(true)
    submit()
    expect(writeSave).toHaveBeenCalledTimes(1)
    expect(vi.mocked(writeSave).mock.calls[0][0].variables.world.date).toBe('1921-08')
    expect(fetchMock).not.toHaveBeenCalled()
    finish()
    await vi.waitFor(() => expect((host.querySelector('input[aria-label="行动输入"]') as HTMLInputElement).disabled).toBe(false))
    submit()
    await vi.waitFor(() => expect(writeSave).toHaveBeenCalledTimes(2))
    expect(vi.mocked(writeSave).mock.calls[1][0].variables.world.date).toBe('1921-09')
  })

  it('LLM-41 保存失败明确可见，不把原始错误或 key 回显到界面/日志', async () => {
    await mountGame(false)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.mocked(writeSave).mockRejectedValueOnce(new Error('storage error ' + secret))
      submit()
      await vi.waitFor(() => expect(host.querySelector('[data-testid="save-status"]')?.textContent).toContain('保存失败'))
      expect(host.querySelector('[data-testid="save-status"]')?.textContent).not.toContain(secret)
      expect(JSON.stringify(log.mock.calls)).not.toContain(secret)
    } finally { log.mockRestore() }
  })

  it('LLM-41 开局存档未完成时也不接收会产生模型调用的行动', async () => {
    let finish!: () => void
    vi.mocked(writeSave).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    await mountGame()
    expect((host.querySelector('input[aria-label="行动输入"]') as HTMLInputElement).disabled).toBe(true)
    submit()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writeSave).toHaveBeenCalledTimes(1)
    finish()
    await vi.waitFor(() => expect((host.querySelector('input[aria-label="行动输入"]') as HTMLInputElement).disabled).toBe(false))
  })

})
