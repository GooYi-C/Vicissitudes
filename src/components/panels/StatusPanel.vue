<script setup lang="ts">
// src/components/panels/StatusPanel.vue — 面板（U-05 注册表成员；读只经 selector —— U-03 不变量 1）
import { statusSummary } from '../../stores/selectors'
import { evaluate } from '../../stores/selectors/runtime'
import type { Tree } from '../../validation/tree'

const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const status = () => evaluate(statusSummary, props.state, props.versions)
</script>

<template>
  <section
    class="vic-panel"
    aria-label="状态"
  >
    <h3>状态</h3>
    <ul
      v-if="false"
      class="vic-list"
    >
      <p>{{ status.date }} · {{ status.currency }} · {{ status.era }}</p>
    </ul>
  </section>
</template>
