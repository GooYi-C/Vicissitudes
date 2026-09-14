<script setup lang="ts">
// C1 StoryView — 主叙事区（消费 activeWindow + pastDigest；骨架期显示规则日叙）
defineProps<{ entries: { turn: number; date: string; text: string }[]; digest: string }>()
</script>

<template>
  <article
    class="vic-story"
    aria-label="叙事"
  >
    <p
      v-if="digest"
      class="vic-story__digest"
    >
      {{ digest }}
    </p>
    <p
      v-for="e in entries"
      :key="e.turn"
      class="vic-story__entry"
    >
      {{ e.text }}
    </p>
    <p
      v-if="entries.length === 0"
      class="vic-story__empty"
    >
      本月平静。（规则日叙 —— 零 LLM）
    </p>
  </article>
</template>
