<script setup lang="ts">
// src/components/panels/WorldPanel.vue — 面板（U-05 注册表成员；读只经 selector —— U-03 不变量 1）
import { worldSituations } from '../../stores/selectors'
import { evaluate } from '../../stores/selectors/runtime'
import type { Tree } from '../../validation/tree'

const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const situations = () => evaluate(worldSituations, props.state, props.versions)
</script>

<template>
  <section
    class="vic-panel"
    aria-label="世界"
  >
    <h3>世界</h3>
    <ul
      v-if="true"
      class="vic-list"
    >
      <li
        v-for="s in situations"
        :key="s.key"
      >
        待决处境（{{ s.templateId }} · {{ s.key }}）
      </li>
    </ul>
  </section>
</template>
