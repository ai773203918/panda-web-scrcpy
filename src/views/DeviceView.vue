<script setup lang="ts">
/**
 * 设备视图页面
 * 
 * 【ZWZW修改说明】
 * - 添加独立侧边画笔工具栏（不依赖分享功能）
 * - 画笔功能直接可用，激活时阻止触摸控制
 * - 使用单例模式的 useScreenShare 实现画笔同步
 */
import { ref, computed, onMounted, onUnmounted, shallowRef, watch, nextTick } from "vue";
import { useDisplay } from "vuetify";
import PairedDevices from "../components/Device/PairedDevices.vue";
import logo from "../assets/logo.svg";
import DeviceShell from "../components/Device/DeviceShell.vue";
import DeviceLogcat from "../components/Device/DeviceLogcat.vue";
import DeviceInfo from "../components/Device/DeviceInfo.vue";
import AbstractList from "./AbstractList.vue";
import VideoContainer from "../components/Device/VideoContainer.vue";
import NavigationBar from "../components/Device/NavigationBar.vue";
import state from "../components/Scrcpy/scrcpy-state";
import AppManager from "../components/Device/AppManager.vue";
import ShareButton from '../components/Remote/ShareButton.vue';
// 【ZWZW修复】导入单例模式的分享状态和类型
import { useScreenShare, type AnnotationStroke_ZWZW } from '@/composables/use-screen-share';
import type { AnnotationSyncMessage_ZWZW } from '@/composables/use-annotation_ZWZW';

const { width } = useDisplay();
/** 宽屏下是否具备显示右侧栏的条件 */
const canShowRightPanel = computed(() => width.value >= 960);
/** 用户手动收起右侧工具栏 */
const rightPanelCollapsed = ref(false);
/** 实际是否显示右侧栏与分隔条 */
const layoutShowsRightPanel = computed(
  () => canShowRightPanel.value && !rightPanelCollapsed.value
);

const containerSize = ref({ width: 0, height: 0 });
const userSetLeftPanelWidth = ref(560);
const leftPanelWidth = computed(() => {
  if (!layoutShowsRightPanel.value) {
    return containerSize.value.width > 0 ? containerSize.value.width : width.value;
  }
  return userSetLeftPanelWidth.value;
});

/** 小屏/单栏时用 100% 宽度，避免列布局下内联 px 与 flex 高度链断裂导致投屏区高度为 0 */
const leftPanelOuterStyle = computed(() => {
  if (!layoutShowsRightPanel.value) {
    return { width: "100%", boxSizing: "border-box" };
  }
  return { width: `${userSetLeftPanelWidth.value}px` };
});

const rightPanelWidth = computed(() =>
  Math.max(300, containerSize.value.width - leftPanelWidth.value - 16)
);
const isResizing = ref(false);
const startX = ref(0);
const startWidth = ref(0);

const deviceMeta = shallowRef(undefined);
const connected = ref(false);
const tab = ref(0);

// 【ZWZW修复】使用单例模式的分享状态
const {
  isSharing: isSharing_ZWZW,
  sendAnnotation_ZWZW,
  addLocalStroke_ZWZW,
  clearAllStrokes_ZWZW,
  annotationStrokes_ZWZW,
} = useScreenShare();

// 【ZWZW新增】画笔状态
const annotationActive_ZWZW = ref(false);
const annotationColor_ZWZW = ref('#ef4444');
const annotationLineWidth_ZWZW = ref(3);

// 【ZWZW新增】预设颜色选项
const colorOptions_ZWZW = [
  { id: 'red', name: '红色', value: '#ef4444' },
  { id: 'orange', name: '橙色', value: '#f97316' },
  { id: 'yellow', name: '黄色', value: '#eab308' },
  { id: 'green', name: '绿色', value: '#22c55e' },
  { id: 'blue', name: '蓝色', value: '#3b82f6' },
  { id: 'purple', name: '紫色', value: '#a855f7' },
  { id: 'white', name: '白色', value: '#ffffff' },
];

// 【ZWZW新增】画笔 Canvas 相关
const annotationCanvas_ZWZW = ref<HTMLCanvasElement | null>(null);
let currentStroke_ZWZW: AnnotationStroke_ZWZW | null = null;
let strokeIdCounter_ZWZW = 0;
let isDrawing_ZWZW = false;
let annotationCtx_ZWZW: CanvasRenderingContext2D | null = null;

// 【ZWZW新增】视频实际显示区域（考虑object-fit: contain的黑边）
interface VideoDisplayBox_ZWZW {
  x: number;      // 相对容器的偏移X
  y: number;      // 相对容器的偏移Y
  width: number;  // 实际显示宽度
  height: number; // 实际显示高度
}
const videoDisplayBox_ZWZW = ref<VideoDisplayBox_ZWZW>({ x: 0, y: 0, width: 0, height: 0 });

const isHorizontalLayout = computed(() => {
  return containerSize.value.width > leftPanelWidth.value + 200;
});

const handleDisconnected = () => {
  connected.value = false;
  deviceMeta.value = undefined;
};

const onPairDevice = (device) => {
  deviceMeta.value = device;
};

const handleConnectionStatus = async (status) => {
  if (status) {
    await ensureContainerSize();
  }
  connected.value = status;
  if (!status) {
    handleDisconnected();
  }
};

const startResize = (e) => {
  if (!layoutShowsRightPanel.value) return;
  isResizing.value = true;
  startX.value = e.clientX || e.touches[0].clientX;
  startWidth.value = userSetLeftPanelWidth.value;
  document.addEventListener("mousemove", resize);
  document.addEventListener("touchmove", resize);
  document.addEventListener("mouseup", stopResize);
  document.addEventListener("touchend", stopResize);
};

const resize = (e) => {
  if (!isResizing.value) return;
  const clientX = e.clientX || e.touches[0]?.clientX;
  const diff = clientX - startX.value;
  userSetLeftPanelWidth.value = Math.max(
    300,
    Math.min(startWidth.value + diff, containerSize.value.width - 300)
  );
};

const stopResize = () => {
  isResizing.value = false;
  document.removeEventListener("mousemove", resize);
  document.removeEventListener("touchmove", resize);
  document.removeEventListener("mouseup", stopResize);
  document.removeEventListener("touchend", stopResize);
};

const containerRef = ref(null);
const DeviceContainerRef = ref(null);
const videoWrapperRef = ref(null);

const containerDimensions = computed(() => {
  /** 与 `.device-container` 中导航列宽 + gap 一致，无额外水平内边距 */
  const navColumnWidth = 56;
  const videoNavGap = 4;
  const canvasBorderTotal = 6;

  return {
    width:
      leftPanelWidth.value - (navColumnWidth + videoNavGap + canvasBorderTotal),
    height: containerSize.value.height - canvasBorderTotal,
  };
});

watch(
  () => containerDimensions.value,
  (newDimensions) => {
    if (videoWrapperRef.value) {
      videoWrapperRef.value.style.width = `${newDimensions.width}px`;
      videoWrapperRef.value.style.height = `${newDimensions.height}px`;
      state.updateVideoContainer();
    }
  },
  { immediate: true }
);

const updateContainerSize = () => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect();
    containerSize.value = {
      width: rect.width,
      height: rect.height,
    };
    if (videoWrapperRef.value) {
      videoWrapperRef.value.style.width = `${containerDimensions.value.width}px`;
      videoWrapperRef.value.style.height = `${containerDimensions.value.height}px`;
      if (state.running) {
        state.updateVideoContainer();
      }
    }
  }
};

const ensureContainerSize = () => {
  return new Promise(resolve => {
    const checkSize = () => {
      updateContainerSize();
      if (containerSize.value.width > 0 && containerSize.value.height > 0) {
        resolve();
      } else {
        requestAnimationFrame(checkSize);
      }
    };
    checkSize();
  });
};

onMounted(async () => {
  await ensureContainerSize();
  window.addEventListener('resize', updateContainerSize);
});

onUnmounted(() => {
  stopResize();
  window.removeEventListener("resize", updateContainerSize);
});

watch(
  () => document.fullscreenElement,
  (newValue) => {
    if (!newValue) {
      setTimeout(updateContainerSize, 100);
    }
  }
);

watch(width, (newWidth, oldWidth) => {
  if (newWidth < 960 && oldWidth >= 960) {
    userSetLeftPanelWidth.value = newWidth;
  } else if (newWidth >= 960 && oldWidth < 960) {
    userSetLeftPanelWidth.value = 450;
  }
});

const tabs = [
  { title: "基础信息", icon: "mdi-information-outline", component: DeviceInfo },
  { title: "应用管理", icon: "mdi-package-variant-closed", component: AppManager },
  { title: "终端", icon: "mdi-console", component: DeviceShell },
  { title: "Logcat", icon: "mdi-text-box-search-outline", component: DeviceLogcat },
];

const pairedDevicesRef = ref(null);

const handleAddDevice = () => {
  pairedDevicesRef.value?.handleAddDevice();
};

// 【ZWZW新增】画笔控制方法
function toggleAnnotation_ZWZW(): void {
  annotationActive_ZWZW.value = !annotationActive_ZWZW.value;
}

function setAnnotationColor_ZWZW(color: string): void {
  annotationColor_ZWZW.value = color;
}

// 【ZWZW新增】生成唯一 ID
function generateStrokeId_ZWZW(): string {
  return `stroke_${Date.now()}_${++strokeIdCounter_ZWZW}`;
}

// 【ZWZW新增】计算视频实际显示区域
function calculateVideoDisplayBox_ZWZW(): VideoDisplayBox_ZWZW {
  if (!videoWrapperRef.value) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  const wrapper = videoWrapperRef.value;
  
  // 获取视频原始尺寸（从state获取）
  const videoW = state.width;
  const videoH = state.height;
  
  // 【ZWZW修复】如果视频尺寸无效，返回容器全尺寸
  if (!videoW || !videoH || videoW <= 0 || videoH <= 0) {
    return { 
      x: 0, 
      y: 0, 
      width: wrapper.clientWidth, 
      height: wrapper.clientHeight 
    };
  }
  
  const videoAspect = videoW / videoH;
  
  // 容器尺寸
  const containerW = wrapper.clientWidth;
  const containerH = wrapper.clientHeight;
  const containerAspect = containerW / containerH;
  
  // 计算实际显示尺寸（object-fit: contain）
  let displayW: number, displayH: number, offsetX: number, offsetY: number;
  
  if (videoAspect > containerAspect) {
    // 视频更宽，以宽度为准
    displayW = containerW;
    displayH = containerW / videoAspect;
    offsetX = 0;
    offsetY = (containerH - displayH) / 2;
  } else {
    // 视频更高，以高度为准
    displayH = containerH;
    displayW = containerH * videoAspect;
    offsetX = (containerW - displayW) / 2;
    offsetY = 0;
  }
  
  return { x: offsetX, y: offsetY, width: displayW, height: displayH };
}

function initAnnotationCanvas_ZWZW(): void {
  if (!annotationCanvas_ZWZW.value || !videoWrapperRef.value) return;
  
  const canvas = annotationCanvas_ZWZW.value;
  const wrapper = videoWrapperRef.value;
  
  // 【ZWZW修复】Canvas尺寸与容器一致，绘制时考虑视频实际显示区域
  const newWidth = wrapper.clientWidth;
  const newHeight = wrapper.clientHeight;
  
  // 检查是否需要更新
  const needsUpdate = canvas.width !== newWidth || canvas.height !== newHeight || !annotationCtx_ZWZW;
  
  if (needsUpdate) {
    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;
    
    annotationCtx_ZWZW = canvas.getContext('2d');
    if (annotationCtx_ZWZW) {
      annotationCtx_ZWZW.lineCap = 'round';
      annotationCtx_ZWZW.lineJoin = 'round';
    }
  }
  
  // 【ZWZW新增】计算视频实际显示区域
  videoDisplayBox_ZWZW.value = calculateVideoDisplayBox_ZWZW();
  
  // 始终重绘
  redrawAllStrokes_ZWZW();
}

// 【ZWZW修复】重绘所有画笔（使用单例数据）
function redrawAllStrokes_ZWZW(): void {
  if (!annotationCtx_ZWZW || !annotationCanvas_ZWZW.value) return;
  
  const canvas = annotationCanvas_ZWZW.value;
  const box = videoDisplayBox_ZWZW.value;
  
  annotationCtx_ZWZW.clearRect(0, 0, canvas.width, canvas.height);
  
  // 【ZWZW修复】直接使用单例中的画笔数据，绘制时考虑视频实际显示区域偏移
  annotationStrokes_ZWZW.value.forEach(stroke => {
    if (stroke.points.length < 2) return;
    
    annotationCtx_ZWZW!.beginPath();
    annotationCtx_ZWZW!.strokeStyle = stroke.color;
    annotationCtx_ZWZW!.lineWidth = stroke.lineWidth;
    
    // 第一个点：归一化坐标 -> 视频显示区域坐标
    const startPoint = {
      x: box.x + stroke.points[0].x * box.width,
      y: box.y + stroke.points[0].y * box.height,
    };
    annotationCtx_ZWZW!.moveTo(startPoint.x, startPoint.y);
    
    for (let i = 1; i < stroke.points.length; i++) {
      const point = {
        x: box.x + stroke.points[i].x * box.width,
        y: box.y + stroke.points[i].y * box.height,
      };
      annotationCtx_ZWZW!.lineTo(point.x, point.y);
    }
    
    annotationCtx_ZWZW!.stroke();
  });
  
  // 绘制当前正在画的线条
  if (currentStroke_ZWZW && currentStroke_ZWZW.points.length >= 2) {
    annotationCtx_ZWZW.beginPath();
    annotationCtx_ZWZW.strokeStyle = currentStroke_ZWZW.color;
    annotationCtx_ZWZW.lineWidth = currentStroke_ZWZW.lineWidth;
    
    const startPoint = {
      x: box.x + currentStroke_ZWZW.points[0].x * box.width,
      y: box.y + currentStroke_ZWZW.points[0].y * box.height,
    };
    annotationCtx_ZWZW.moveTo(startPoint.x, startPoint.y);
    
    for (let i = 1; i < currentStroke_ZWZW.points.length; i++) {
      const point = {
        x: box.x + currentStroke_ZWZW.points[i].x * box.width,
        y: box.y + currentStroke_ZWZW.points[i].y * box.height,
      };
      annotationCtx_ZWZW.lineTo(point.x, point.y);
    }
    
    annotationCtx_ZWZW.stroke();
  }
}

function onAnnotationPointerDown_ZWZW(e: PointerEvent): void {
  if (!annotationActive_ZWZW.value || !annotationCanvas_ZWZW.value) return;
  
  // 【ZWZW修复】立即更新视频显示区域
  videoDisplayBox_ZWZW.value = calculateVideoDisplayBox_ZWZW();
  initAnnotationCanvas_ZWZW();
  
  const box = videoDisplayBox_ZWZW.value;
  
  // 【ZWZW修复】验证显示区域有效性
  if (box.width <= 0 || box.height <= 0) {
    console.warn('[DeviceView_ZWZW] 视频显示区域无效，忽略画笔事件');
    return;
  }
  
  const rect = annotationCanvas_ZWZW.value.getBoundingClientRect();
  
  // 相对容器的坐标
  const containerX = e.clientX - rect.left;
  const containerY = e.clientY - rect.top;
  
  // 转换为相对视频实际显示区域的坐标
  const videoX = containerX - box.x;
  const videoY = containerY - box.y;
  
  // 归一化到视频区域（0-1）
  const x = videoX / box.width;
  const y = videoY / box.height;
  
  // 【ZWZW修复】限制在视频区域内
  const clampedX = Math.max(0, Math.min(1, x));
  const clampedY = Math.max(0, Math.min(1, y));
  
  // 【ZWZW修复】创建新线条，使用归一化坐标
  currentStroke_ZWZW = {
    id: generateStrokeId_ZWZW(),
    color: annotationColor_ZWZW.value,
    lineWidth: annotationLineWidth_ZWZW.value,
    points: [{ x: clampedX, y: clampedY }],
    timestamp: Date.now(),
    source: 'local',
  };
  
  isDrawing_ZWZW = true;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  e.preventDefault();
  e.stopPropagation();
}

function onAnnotationPointerMove_ZWZW(e: PointerEvent): void {
  if (!isDrawing_ZWZW || !currentStroke_ZWZW || !annotationCanvas_ZWZW.value) return;
  
  const box = videoDisplayBox_ZWZW.value;
  const rect = annotationCanvas_ZWZW.value.getBoundingClientRect();
  
  // 相对容器的坐标
  const containerX = e.clientX - rect.left;
  const containerY = e.clientY - rect.top;
  
  // 转换为相对视频实际显示区域的坐标
  const videoX = containerX - box.x;
  const videoY = containerY - box.y;
  
  // 归一化到视频区域（0-1）
  const x = videoX / box.width;
  const y = videoY / box.height;
  
  // 【ZWZW修复】限制在视频区域内
  const clampedX = Math.max(0, Math.min(1, x));
  const clampedY = Math.max(0, Math.min(1, y));
  
  currentStroke_ZWZW.points.push({ x: clampedX, y: clampedY });
  redrawAllStrokes_ZWZW();
  e.preventDefault();
}

function onAnnotationPointerUp_ZWZW(e: PointerEvent): void {
  if (!isDrawing_ZWZW || !currentStroke_ZWZW) {
    isDrawing_ZWZW = false;
    return;
  }
  
  isDrawing_ZWZW = false;
  (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  
  // 【ZWZW修复】保存线条到单例
  if (currentStroke_ZWZW.points.length >= 2) {
    addLocalStroke_ZWZW(currentStroke_ZWZW);
    
    // 【ZWZW修复】同步到远程观看者
    if (isSharing_ZWZW.value) {
      const msg: AnnotationSyncMessage_ZWZW = {
        type: 'annotation',
        action: 'stroke',
        data: currentStroke_ZWZW,
      };
      sendAnnotation_ZWZW(msg);
    }
  }
  
  currentStroke_ZWZW = null;
}

function clearAnnotation_ZWZW(): void {
  // 【ZWZW修复】使用单例方法清除画笔
  clearAllStrokes_ZWZW();
  
  // 重绘
  if (annotationCtx_ZWZW && annotationCanvas_ZWZW.value) {
    annotationCtx_ZWZW.clearRect(0, 0, annotationCanvas_ZWZW.value.width, annotationCanvas_ZWZW.value.height);
  }
  
  // 【ZWZW修复】同步清除到远程观看者
  if (isSharing_ZWZW.value) {
    sendAnnotation_ZWZW({
      type: 'annotation',
      action: 'clear_all',
    });
  }
}

// 【ZWZW修复】监听单例画笔数据变化，自动重绘
watch(annotationStrokes_ZWZW, () => {
  if (annotationStrokes_ZWZW.value.length > 0 || annotationActive_ZWZW.value) {
    nextTick(() => {
      initAnnotationCanvas_ZWZW();
    });
  }
}, { deep: true });

// 监听画笔激活状态，初始化 Canvas
watch(annotationActive_ZWZW, (active) => {
  if (!active) {
    // 【ZWZW修复】画笔禁用时，清理绘制状态
    if (isDrawing_ZWZW && currentStroke_ZWZW) {
      // 保存当前线条（如果有效）
      if (currentStroke_ZWZW.points.length >= 2) {
        addLocalStroke_ZWZW(currentStroke_ZWZW);
      }
    }
    isDrawing_ZWZW = false;
    currentStroke_ZWZW = null;
  }
  nextTick(() => {
    initAnnotationCanvas_ZWZW();
  });
});

// 【ZWZW修复】监听窗口大小变化，始终重绘画笔
watch(() => containerSize.value, () => {
  // 【ZWZW修复】立即更新视频显示区域
  videoDisplayBox_ZWZW.value = calculateVideoDisplayBox_ZWZW();
  nextTick(() => {
    initAnnotationCanvas_ZWZW();
  });
}, { deep: true });

// 【ZWZW修复】监听视频尺寸变化
watch(
  () => [state.width, state.height],
  () => {
    videoDisplayBox_ZWZW.value = calculateVideoDisplayBox_ZWZW();
    nextTick(() => {
      initAnnotationCanvas_ZWZW();
    });
  }
);

// 【ZWZW修复】监听容器尺寸变化（这才是真正控制视频区域大小的值）
watch(
  () => containerDimensions.value,
  (newDim, oldDim) => {
    // 只有尺寸真正变化时才更新
    if (Math.abs(newDim.width - (oldDim?.width || 0)) > 1 ||
        Math.abs(newDim.height - (oldDim?.height || 0)) > 1) {
      videoDisplayBox_ZWZW.value = calculateVideoDisplayBox_ZWZW();
      nextTick(() => {
        initAnnotationCanvas_ZWZW();
      });
    }
  },
  { deep: true }
);
</script>

<template>
  <v-app-bar
    flat
    height="48"
    color="surface"
    class="top-bar"
    app
  >
    <div class="bar-inner">
      <v-img
        :src="logo"
        max-width="22"
        max-height="22"
        class="flex-shrink-0"
      />
      <span class="brand-name">PANDASCRCPY</span>
      <div class="bar-devices">
        <PairedDevices
          ref="pairedDevicesRef"
          @pair-device="onPairDevice"
          @update-connection-status="handleConnectionStatus"
        />
      </div>
      <ShareButton v-if="connected" class="ml-1 flex-shrink-0" />
      <slot name="remote-button" />
      <v-spacer />
      <v-btn
        v-if="canShowRightPanel"
        icon
        variant="text"
        size="small"
        color="secondary"
        class="flex-shrink-0"
        :title="rightPanelCollapsed ? '展开侧栏' : '收起侧栏'"
        @click="rightPanelCollapsed = !rightPanelCollapsed"
      >
        <v-icon size="20">
          {{ rightPanelCollapsed ? 'mdi-chevron-double-left' : 'mdi-chevron-double-right' }}
        </v-icon>
      </v-btn>
      <v-btn
        icon
        variant="text"
        size="small"
        color="secondary"
        href="https://github.com/pandatestgrid/panda-web-scrcpy"
        target="_blank"
        rel="noopener noreferrer"
        title="源码仓库"
      >
        <v-icon size="20">mdi-github</v-icon>
      </v-btn>
      <a
        class="cta-btn d-none d-sm-inline-flex"
        href="https://www.pandatest.net/device"
        target="_blank"
        rel="noopener noreferrer"
        title="AI 助手、虚拟屏幕、设备群控、脚本录制回放、性能检测等"
      >
        <v-icon size="14" class="mr-1">mdi-rocket-launch-outline</v-icon>
        加强版 · 免费
        <v-icon size="12" class="ml-1">mdi-arrow-top-right</v-icon>
      </a>
    </div>
  </v-app-bar>

  <v-main class="main-area">
    <div
      ref="containerRef"
      class="layout"
      :class="{ 'horizontal-layout': isHorizontalLayout }"
    >
      <div class="left-panel" :style="leftPanelOuterStyle">
        <div class="panel-card">
          <div class="panel-inner">
            <div
              v-if="connected"
              ref="DeviceContainerRef"
              class="device-container"
            >
              <!-- 【ZWZW新增】侧边画笔工具栏 -->
              <div class="side-toolbar_ZWZW">
                <v-btn
                  variant="text"
                  size="small"
                  :color="annotationActive_ZWZW ? 'primary' : 'default'"
                  class="tool-btn_ZWZW"
                  title="画笔"
                  @click="toggleAnnotation_ZWZW"
                >
                  <!-- 【ZWZW修复】图标逻辑：启用时显示画笔，禁用时显示关闭画笔 -->
                  <v-icon size="18">{{ annotationActive_ZWZW ? 'mdi-pencil' : 'mdi-pencil-off' }}</v-icon>
                </v-btn>
                
                <v-menu v-if="annotationActive_ZWZW" offset-y right>
                  <template v-slot:activator="{ props }">
                    <v-btn variant="text" size="small" v-bind="props" class="tool-btn_ZWZW" title="选择颜色">
                      <span class="color-dot_ZWZW" :style="{ background: annotationColor_ZWZW }" />
                    </v-btn>
                  </template>
                  <v-list density="compact">
                    <v-list-item
                      v-for="color in colorOptions_ZWZW"
                      :key="color.id"
                      @click="setAnnotationColor_ZWZW(color.value)"
                    >
                      <template v-slot:prepend>
                        <span class="color-dot_ZWZW mr-2" :style="{ background: color.value }" />
                      </template>
                      <v-list-item-title>{{ color.name }}</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>
                
                <v-btn
                  v-if="annotationActive_ZWZW && annotationStrokes_ZWZW.length > 0"
                  variant="text"
                  size="small"
                  color="error"
                  class="tool-btn_ZWZW"
                  title="清除画笔"
                  @click="clearAnnotation_ZWZW"
                >
                  <v-icon size="18">mdi-eraser</v-icon>
                </v-btn>
              </div>
              
              <div
                ref="videoWrapperRef"
                class="video-wrapper"
                :class="{ 'annotation-active_ZWZW': annotationActive_ZWZW }"
                :style="{
                  width: `${containerDimensions.width}px`,
                  height: `${containerDimensions.height}px`
                }"
              >
                <VideoContainer />
                <!-- 【ZWZW修复】画笔Canvas - 画笔未激活时pointer-events: none让触摸穿透 -->
                <canvas
                  v-show="annotationStrokes_ZWZW.length > 0 || annotationActive_ZWZW"
                  ref="annotationCanvas_ZWZW"
                  class="annotation-canvas_ZWZW"
                  :class="{ 'penetrable_ZWZW': !annotationActive_ZWZW }"
                  @pointerdown="onAnnotationPointerDown_ZWZW"
                  @pointermove="onAnnotationPointerMove_ZWZW"
                  @pointerup="onAnnotationPointerUp_ZWZW"
                />
              </div>
              <div class="navigation-wrapper">
                <NavigationBar />
              </div>
            </div>
            <div v-else class="empty-state-wrap">
              <div class="empty-state">
                <div class="empty-state-icon">
                  <v-progress-circular
                    v-if="state.connecting"
                    indeterminate
                    color="primary"
                    size="48"
                    width="3"
                  />
                  <v-btn
                    v-else
                    icon
                    size="56"
                    color="primary"
                    class="power-btn"
                    @click="handleAddDevice"
                  >
                    <v-icon size="28">mdi-power</v-icon>
                  </v-btn>
                </div>
                <p class="empty-state-title">
                  {{ state.connecting ? '正在连接...' : '连接设备' }}
                </p>
                <p class="empty-state-desc">
                  {{ state.connecting ? '请稍候' : '确保设备已开启 USB 调试模式' }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="layoutShowsRightPanel"
        class="resizer"
        @mousedown="startResize"
        @touchstart="startResize"
      />
      <div
        v-if="layoutShowsRightPanel"
        class="right-panel"
        :style="{ width: rightPanelWidth + 'px' }"
      >
        <div class="panel-card right-card">
          <template v-if="connected">
            <div class="tab-bar">
              <button
                v-for="(item, index) in tabs"
                :key="index"
                :class="['tab-item', { active: tab === index }]"
                @click="tab = index"
              >
                <v-icon size="14">{{ item.icon }}</v-icon>
                <span>{{ item.title }}</span>
              </button>
            </div>
            <v-window v-model="tab" class="tab-content">
              <v-window-item
                v-for="(item, index) in tabs"
                :key="index"
                :value="index"
              >
                <component :is="item.component" :device-meta="deviceMeta" />
              </v-window-item>
            </v-window>
          </template>
          <template v-else>
            <AbstractList />
          </template>
        </div>
      </div>
    </div>
  </v-main>

</template>

<style lang="scss" scoped>
.top-bar {
  border-bottom: 1px solid var(--border) !important;
}

.bar-inner {
  display: flex;
  align-items: center;
  flex-grow: 1;
  gap: 8px;
  padding: 0 12px;
  max-width: 100%;
}

.brand-name {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: rgba(24, 24, 27, 0.85);
  white-space: nowrap;
  user-select: none;
}

.bar-devices {
  flex: 1 1 auto;
  min-width: 0;
}

.cta-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--cta-bg);
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.2s ease;
  letter-spacing: 0.01em;
  line-height: 1;

  &:hover {
    background: var(--cta-hover);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    transform: translateY(-1px);
  }
}

.main-area {
  background: rgb(var(--v-theme-background));
}

.layout {
  display: flex;
  height: calc(100vh - 48px);
  overflow: hidden;

  &.horizontal-layout {
    flex-direction: row;
  }
}

.left-panel {
  min-width: 200px;
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.right-panel {
  flex: 1 1 0;
  min-width: 300px;
  min-height: 0;
  padding: 0 4px 6px 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--border);
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.panel-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0;
  box-sizing: border-box;
}

.right-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-bar {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  background: rgb(var(--v-theme-surface));
  height: 36px;
}

.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  border: none;
  background: none;
  cursor: pointer;
  position: relative;
  transition: color 0.15s ease;
  white-space: nowrap;

  &:hover {
    color: rgba(24, 24, 27, 0.85);
    background: rgba(24, 24, 27, 0.03);
  }

  &.active {
    color: rgb(var(--v-theme-primary));

    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 16px;
      right: 16px;
      height: 2px;
      background: rgb(var(--v-theme-primary));
      
    }
  }
}

.tab-content {
  position: relative;
  flex: 1 1 0;
  min-height: 0;

  :deep(.v-window__container) {
    position: absolute !important;
    inset: 0;
  }

  :deep(.v-window-item) {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 0;
    margin: 0;
  }

  :deep(.v-window-item > *) {
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
  }
}

.resizer {
  flex-shrink: 0;
  align-self: stretch;
  width: 6px;
  margin: 10px 0;
  box-sizing: border-box;
  cursor: col-resize;
  display: flex;
  justify-content: center;
  align-items: stretch;
  user-select: none;
  touch-action: none;

  &::before {
    content: '';
    width: 1px;
    flex-shrink: 0;
    background-color: var(--border-hover);
    transition: width 0.12s ease, background-color 0.12s ease;
  }

  &:hover::before,
  &:active::before {
    width: 2px;
    background-color: rgba(24, 24, 27, 0.22);
  }
}

.empty-state-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgb(var(--v-theme-background));
  text-align: center;
  gap: 8px;
  width: 100%;
  height: 100%;
}

.empty-state-icon {
  margin-bottom: 8px;
}

.power-btn {
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 4px 16px rgba(24, 24, 27, 0.12);
  }
}

.empty-state-title {
  font-size: 16px;
  font-weight: 600;
  color: rgba(24, 24, 27, 0.85);
  margin: 0;
}

.empty-state-desc {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
  max-width: 260px;
}

.device-container {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  padding: 0;
  gap: 4px;
  box-sizing: border-box;
  background: transparent;
}

/* 【ZWZW新增】侧边画笔工具栏 */
.side-toolbar_ZWZW {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 2px;
  background: rgba(var(--v-theme-surface), 0.95);
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}

.tool-btn_ZWZW {
  min-width: 36px !important;
  width: 36px !important;
  height: 36px !important;
  padding: 0 !important;
}

.color-dot_ZWZW {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.video-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: transparent;
  overflow: visible;
  box-sizing: border-box;
  transition: none !important;
}

/* 【ZWZW新增】画笔激活时的样式 */
.video-wrapper.annotation-active_ZWZW {
  touch-action: none;
}

/* 【ZWZW新增】画笔 Canvas 叠加层 */
.annotation-canvas_ZWZW {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100;
  /* 【ZWZW修复】默认允许触摸穿透 */
  pointer-events: none !important;
}

/* 【ZWZW修复】画笔激活时，Canvas 捕获触摸事件 */
.annotation-canvas_ZWZW:not(.penetrable_ZWZW) {
  pointer-events: auto !important;
  touch-action: none !important;
  cursor: crosshair;
}

.navigation-wrapper {
  width: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
}

@media (max-width: 959px) {
  .layout {
    flex-direction: column;
    min-height: 0;
  }

  .left-panel {
    flex: 1 1 0;
    min-height: 0;
    max-width: 100%;
    padding: 0;
  }

  .right-panel {
    padding: 0 6px 10px;
  }

  .resizer {
    display: none;
  }
}

</style>
