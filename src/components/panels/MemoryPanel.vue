<script setup lang="ts">
// src/components/panels/MemoryPanel.vue — 面板（U-05 注册表成员；读只经 selector —— U-03 不变量 1）
import { memoryBook } from '../../stores/selectors'
import { evaluate } from '../../stores/selectors/runtime'
import type { Tree } from '../../validation/tree'

const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const book = () => evaluate(memoryBook, props.state, props.versions)
</script>

<template>
  <section
    class="vic-panel"
    aria-label="记忆"
  >
    <h3>记忆</h3>
    <ul
      v-if="true"
      class="vic-list"
    >
      <li
        v-for="m in book.items"
        :key="m.id"
      >
        {{ m.title }}
      </li>
    </ul>
  </section>
</template>
