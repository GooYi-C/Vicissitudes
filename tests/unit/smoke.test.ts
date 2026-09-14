import { describe, it, expect } from 'vitest'

// SK-00 冒烟：壳活着、版本策略到位（TEC-01 的运行时侧证明）
describe('SK-00 仓库壳冒烟', () => {
  it('Vue 可用（组合根能拿到渲染 API）', async () => {
    const { createApp, h } = await import('vue')
    const app = createApp({ render: () => h('div', 'vic') })
    expect(app).toBeTruthy()
  })

  it('Pinia 可用（store 体系可建）', async () => {
    const { createPinia } = await import('pinia')
    expect(createPinia()).toBeTruthy()
  })

  it('Zod 可用（schema 体系可建）', async () => {
    const { z } = await import('zod')
    const EraSchema = z.object({ id: z.string(), fromYear: z.number(), toYear: z.number() })
    expect(EraSchema.safeParse({ id: 'era-warlord', fromYear: 1921, toYear: 1928 }).success).toBe(true)
  })
})
