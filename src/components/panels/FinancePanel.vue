<script setup lang="ts">
// src/components/panels/FinancePanel.vue — 面板（U-05 注册表成员；读只经 selector —— U-03 不变量 1）
import { financeSheets } from '../../stores/selectors'
import { evaluate } from '../../stores/selectors/runtime'
import type { Tree } from '../../validation/tree'

const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const sheets = () => evaluate(financeSheets, props.state, props.versions)
</script>

<template>
  <section
    class="vic-panel"
    aria-label="账本"
  >
    <h3>账本</h3>
    <ul
      v-if="false"
      class="vic-list"
    >
      <p>收支 {{ sheets.income.length }} 笔 · 资产 {{ sheets.assets.length }} · 负债 {{ sheets.liabilities.length }}</p>
    </ul>
  </section>
</template>
