<script setup lang="ts">
// src/components/panels/StatusPanel.vue — 面板（U-05 注册表成员；读只经 selector —— U-03 不变量 1）
// 数据源：world.date / economy.currency / career（声望档位、健康、随身现银）/ settlement（现金）
// / identity（出身）。声望显示档位名（REBUILD.md：事件门槛挂档位，玩家记档位不记点数）。
import { statusSummary } from '../../stores/selectors'
import { evaluate } from '../../stores/selectors/runtime'
import type { Tree } from '../../validation/tree'

const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const status = () => evaluate(statusSummary, props.state, props.versions)

// 健康口径 E-0.2：60 轻伤 / 30 重伤 / ≤0 死亡线
function healthLabel(health: number): string {
  if (health <= 0) return '死亡线'
  if (health < 30) return '重伤'
  if (health < 60) return '轻伤'
  return '无恙'
}
</script>

<template>
  <section
    class="vic-panel"
    aria-label="状态"
  >
    <h3>状态</h3>
    <dl class="vic-kv">
      <dt>日期</dt>
      <dd>{{ status().date }}</dd>
      <dt>时代</dt>
      <dd>{{ status().era }}</dd>
      <dt>出身</dt>
      <dd>{{ status().identity ? `${status().identity.kind}（${status().identity.startCity}）` : '未选' }}</dd>
      <dt>现金</dt>
      <dd>{{ status().cash }} {{ status().currency }}</dd>
      <dt>随身</dt>
      <dd>{{ status().personalCash }} 元</dd>
      <dt>声望</dt>
      <dd>{{ status().reputationTier }}（{{ status().reputation }}）</dd>
      <dt>健康</dt>
      <dd>{{ healthLabel(status().health) }}（{{ status().health }}）</dd>
    </dl>
  </section>
</template>
