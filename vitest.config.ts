import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    environment: 'node',
    // stores 测试需要 fake-indexeddb + localStorage（per-file 隔离）
    environmentMatchGlobs: [
      ['tests/unit/stores/**', 'happy-dom'],
    ],
    setupFiles: ['tests/unit/stores/setup.ts'],
  },
})
