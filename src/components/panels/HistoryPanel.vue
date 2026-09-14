<script setup lang="ts">
// src/components/panels/HistoryPanel.vue — 面板（U-05 注册表成员；读只经 selector —— U-03 不变量 1）
import { timelineView } from '../../stores/selectors'
import { evaluate } from '../../stores/selectors/runtime'
import type { Tree } from '../../validation/tree'

const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const entries = () => evaluate(timelineView, props.state, props.versions)
</script>

<template>
  <section
    class="vic-panel"
    aria-label="史册"
  >
    <h3>史册</h3>
    <ul
      v-if="true"
      class="vic-list"
    >
      <li
        v-for="e in entries"
        :key="e.id"
      >
        {{ e.date }} {{ e.title }}
      </li>
    </ul>
  </section>
</template>
