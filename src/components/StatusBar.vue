<script setup lang="ts">
// C3 StatusBar — 底部状态条（MOB-02：安全区避让 env(safe-area-inset-bottom)；44px 触区 MOB-03）
defineProps<{ date: string; currency: string; money: number }>()
</script>

<template>
  <footer class="vic-statusbar">
    <span>{{ date }}</span><span>{{ currency }}</span><span>{{ money }} 元</span>
  </footer>
</template>
