<template>
  <div class="remote-view">
    <ViewerPanel :initial-peer-id="initialPeerId" />
  </div>
</template>

<script setup lang="ts">
import ViewerPanel from '@/components/Remote/ViewerPanel.vue';

defineProps<{
  initialPeerId?: string;
}>();
</script>

<style scoped>
/* 【ZWZW修复】确保容器填充整个视口 */
.remote-view {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #18181b;
}
</style>
