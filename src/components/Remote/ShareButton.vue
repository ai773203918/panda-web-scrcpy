<template>
  <div class="share-root">
    <!-- 分享按钮 -->
    <v-btn
      v-if="!isSharing"
      variant="text"
      size="small"
      color="secondary"
      class="text-none"
      :loading="connectionState === 'initializing'"
      @click="handleStartShare"
    >
      <v-icon start size="16">mdi-share-variant-outline</v-icon>
      分享
    </v-btn>

    <!-- 分享中状态 -->
    <div v-else class="sharing-row">
      <button class="share-chip" @click="showShareDialog = true">
        <span class="share-dot" />
        <span class="share-label">分享中</span>
        <span v-if="viewerCount > 0" class="share-badge">{{ viewerCount }}</span>
      </button>
      
      <button class="share-stop" title="停止分享" @click="handleStopShare">
        <v-icon size="14">mdi-stop</v-icon>
      </button>
    </div>

    <!-- 分享对话框 -->
    <v-dialog v-model="showShareDialog" max-width="420">
      <div class="share-dialog">
        <div class="sd-header">
          <span class="sd-title">屏幕分享中</span>
          <button class="sd-close" @click="showShareDialog = false">
            <v-icon size="18">mdi-close</v-icon>
          </button>
        </div>

        <div class="sd-body">
          <p class="sd-desc">将链接发给观看者，可直接打开浏览器观看设备屏幕。</p>

          <!-- 远程控制权限开关 -->
          <div class="control-toggle_ZWZW">
            <div class="toggle-header">
              <v-icon size="16" color="primary">mdi-remote</v-icon>
              <span class="toggle-label">远程控制</span>
            </div>
            <div class="toggle-row">
              <v-switch
                v-model="localAllowControl"
                color="primary"
                hide-details
                density="compact"
                @update:modelValue="handleControlToggle_ZWZW"
              />
              <span class="toggle-status">{{ localAllowControl ? '允许控制' : '仅观看' }}</span>
            </div>
            <p class="toggle-hint">
              {{ localAllowControl ? '观看者可以远程操作设备' : '观看者只能观看，无法操作' }}
            </p>
          </div>

          <v-text-field
            :model-value="shareLink"
            readonly
            label="分享链接"
            hide-details
            class="mb-3"
          >
            <template v-slot:append-inner>
              <v-btn icon variant="text" size="x-small" @click="copyShareLink">
                <v-icon size="16">mdi-content-copy</v-icon>
              </v-btn>
            </template>
          </v-text-field>

          <v-text-field
            :model-value="peerId"
            readonly
            label="Peer ID"
            hide-details
            class="mb-3"
          >
            <template v-slot:append-inner>
              <v-btn icon variant="text" size="x-small" @click="copyPeerId">
                <v-icon size="16">mdi-content-copy</v-icon>
              </v-btn>
            </template>
          </v-text-field>

          <div class="sd-viewers">
            <v-icon size="14" color="info" class="mr-1">mdi-account-multiple</v-icon>
            <span>{{ viewerCount }} 位观看者</span>
          </div>
        </div>

        <div class="sd-actions">
          <v-btn size="small" variant="text" color="error" @click="handleStopShare">
            停止分享
          </v-btn>
          <v-spacer />
          <v-btn size="small" color="primary" @click="showShareDialog = false">
            确定
          </v-btn>
        </div>
      </div>
    </v-dialog>

    <v-snackbar v-model="showError" color="error" timeout="3000">
      {{ error }}
    </v-snackbar>

    <v-snackbar v-model="showCopied" color="success" timeout="2000">
      已复制到剪贴板
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
/**
 * 分享按钮组件 _ZWZW
 * 
 * 【ZWZW修改说明】
 * - 使用单例模式的 useScreenShare
 * - 修复权限同步问题
 */

import { ref, watch, computed } from 'vue';
import { useScreenShare } from '@/composables/use-screen-share';
import scrcpyState from '@/components/Scrcpy/scrcpy-state';

const {
  isSharing,
  peerId,
  viewerCount,
  connectionState,
  error,
  startSharing,
  stopSharing,
  allowRemoteControl,
  setAllowRemoteControl,
} = useScreenShare();

const showError = ref(false);
const showCopied = ref(false);
const showShareDialog = ref(false);

// 本地控制权限状态
const localAllowControl = ref(true);

// 【ZWZW修复】监听分享状态变化，初始化权限
watch(isSharing, (sharing) => {
  if (sharing && peerId.value) {
    showShareDialog.value = true;
    localAllowControl.value = allowRemoteControl.value;
  }
});

// 【ZWZW修复】监听 allowRemoteControl 变化，同步 localAllowControl
// 确保停止分享后状态同步
watch(allowRemoteControl, (newValue) => {
  localAllowControl.value = newValue;
});

// 处理权限开关变化
function handleControlToggle_ZWZW(value: boolean) {
  setAllowRemoteControl(value);
}

const shareLink = computed(() => {
  if (!peerId.value) return '';
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?remote=${peerId.value}`;
});

watch(error, (newError) => {
  if (newError) showError.value = true;
});

async function handleStartShare() {
  const canvas = scrcpyState.getCanvas();
  if (!canvas) {
    showError.value = true;
    return;
  }
  try {
    await startSharing(canvas as HTMLCanvasElement, 30);
  } catch (err) {
    console.error('启动分享失败:', err);
  }
}

function handleStopShare() {
  showShareDialog.value = false;
  stopSharing();
}

async function copyShareLink() {
  if (!shareLink.value) return;
  try {
    await navigator.clipboard.writeText(shareLink.value);
    showCopied.value = true;
  } catch (err) {
    console.error('复制失败:', err);
  }
}

async function copyPeerId() {
  if (!peerId.value) return;
  try {
    await navigator.clipboard.writeText(peerId.value);
    showCopied.value = true;
  } catch (err) {
    console.error('复制失败:', err);
  }
}
</script>

<style scoped>
.share-root {
  display: inline-flex;
  align-items: center;
}

.sharing-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.share-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 8px;
  background: rgba(34, 197, 94, 0.06);
  font-size: 12px;
  font-weight: 500;
  color: #16a34a;
  cursor: pointer;
  transition: background 0.15s;
}

.share-chip:hover {
  background: rgba(34, 197, 94, 0.1);
}

.share-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.share-badge {
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.15);
  font-size: 10px;
  font-weight: 600;
}

.share-stop {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(239, 68, 68, 0.7);
  cursor: pointer;
  transition: background 0.15s;
}

.share-stop:hover {
  background: rgba(239, 68, 68, 0.08);
}

.share-dialog {
  background: rgb(var(--v-theme-surface));
  border-radius: 12px;
  overflow: hidden;
}

.sd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 0;
}

.sd-title {
  font-size: 15px;
  font-weight: 600;
  color: rgba(24, 24, 27, 0.85);
}

.sd-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(24, 24, 27, 0.4);
  cursor: pointer;
}

.sd-close:hover {
  background: rgba(24, 24, 27, 0.06);
}

.sd-body {
  padding: 16px;
}

.sd-desc {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 14px;
}

.control-toggle_ZWZW {
  padding: 12px;
  margin-bottom: 14px;
  background: rgba(var(--v-theme-primary), 0.04);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
  border-radius: 8px;
}

.toggle-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.toggle-label {
  font-size: 13px;
  font-weight: 600;
  color: rgba(24, 24, 27, 0.85);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle-status {
  font-size: 12px;
  font-weight: 500;
  color: rgba(24, 24, 27, 0.7);
}

.toggle-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--muted);
}

.sd-viewers {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--muted);
}

.sd-actions {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
</style>
