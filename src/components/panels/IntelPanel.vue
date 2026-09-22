<script setup lang="ts">
// src/components/panels/IntelPanel.vue — 面板（U-05 注册表成员；读只经 selector —— U-03 不变量 1）
import { intelObservations } from '../../stores/selectors'
import { evaluate } from '../../stores/selectors/runtime'
import type { Tree } from '../../validation/tree'

const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const observations = () => evaluate(intelObservations, props.state, props.versions)
</script>

<template>
  <section
    class="vic-panel"
    aria-label="情报"
  >
    <h3>情报</h3>
    <ul
      v-if="true"
      class="vic-list"
    >
      <li
        v-for="o in observations()"
        :key="o.id"
      >
        {{ o.region }} · 迷雾 L{{ o.level }}
      </li>
    </ul>
  </section>
</template>
