<script setup lang="ts">
// SK-00 仓库壳：空壳可 build 即第 0 层完成判据。
// 面板与常驻组件在 SK-06 落地（§二十八 SK-00 范围外）。
</script>

<template>
  <main class="vic-shell">
    <h1>民国风云</h1>
    <p class="vic-shell__sub">
      Vicissitudes — 骨架施工中（SK-00 仓库壳）
    </p>
  </main>
</template>

<style scoped>
.vic-shell {
  font-family: system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}
.vic-shell__sub {
  color: #666;
  font-size: 0.875rem;
}
</style>
