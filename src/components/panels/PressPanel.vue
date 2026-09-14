<script setup lang="ts">
// src/components/panels/PressPanel.vue — 面板（U-05 注册表成员；读只经 selector —— U-03 不变量 1）
import { pressRack } from '../../stores/selectors'
import { evaluate } from '../../stores/selectors/runtime'
import type { Tree } from '../../validation/tree'

const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const papers = () => evaluate(pressRack, props.state, props.versions)
</script>

<template>
  <section
    class="vic-panel"
    aria-label="报夹"
  >
    <h3>报夹</h3>
    <ul
      v-if="true"
      class="vic-list"
    >
      <li
        v-for="p in papers"
        :key="p.id"
      >
        {{ p.name }}（{{ p.city }}）
      </li>
    </ul>
  </section>
</template>
