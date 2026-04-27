<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide, nextTick } from 'vue';
import {
    AndroidMotionEventAction,
    AndroidMotionEventButton,
    ScrcpyPointerId,
    type ScrcpySetClipboardControlMessage,
} from '@yume-chan/scrcpy';
import client from '../Scrcpy/adb-client';
import state from '../Scrcpy/scrcpy-state';

const videoContainer = ref<HTMLDivElement | null>(null);
const videoWrapper = ref<HTMLDivElement | null>(null);
const isVideoContainerFocused = ref(false);
const isCanvasReady = ref(false);
const isFullyRendered = ref(false);
/** 视频流已就绪（有尺寸且 running），用于占位/铺满切换与淡入 */
const pictureReady = ref(false);
const videoFadedIn = ref(false);
const placeholderAspect = ref('9 / 16');
let layoutFadeRaf = 0;

const MOUSE_EVENT_BUTTON_TO_ANDROID_BUTTON = [
    AndroidMotionEventButton.Primary,
    AndroidMotionEventButton.Tertiary,
    AndroidMotionEventButton.Secondary,
    AndroidMotionEventButton.Back,
    AndroidMotionEventButton.Forward,
];

// 【ZWZW修复】使用 ScrcpyPointerId 作为 key，而不是原始 pointerId
// 因为手机上每次触摸的 pointerId 会变化，但我们都映射到 ScrcpyPointerId.Finger
const activePointers = new Set<bigint>();

/** 键盘/滚轮等需要焦点，避免误触 */
const isReady = () => (
    !!state.scrcpy &&
    !!state.canvas &&
    isVideoContainerFocused.value &&
    isCanvasReady.value &&
    isFullyRendered.value
);

/** 触摸轨迹：不要求焦点，避免移出画布后因 blur/失焦导致收不到 up 而卡在按下状态 */
const touchPipelineReady = () => (
    !!state.scrcpy &&
    !!state.canvas &&
    isCanvasReady.value &&
    isFullyRendered.value
);

const isPointInCanvas = (clientX: number, clientY: number): boolean => {
    if (!state.canvas) return false;
    const rect = state.canvas.getBoundingClientRect();
    return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
    );
};

const handleWheel = (e: WheelEvent) => {
    if (!isReady() || !isPointInCanvas(e.clientX, e.clientY)) return;
    videoContainer.value?.focus();
    e.preventDefault();
    e.stopPropagation();

    const { x, y } = state.clientPositionToDevicePosition(e.clientX, e.clientY);
    state.scrcpy?.controller!.injectScroll({
        videoWidth: state.width!,
        videoHeight: state.height!,
        pointerX: x,
        pointerY: y,
        scrollX: -e.deltaX / 100,
        scrollY: -e.deltaY / 100,
        buttons: 0,
    });
};

// 【ZWZW新增】日志收集数组，用于远程调试
const debugLogs_ZWZW: Array<{time: string; msg: string; data?: unknown}> = [];
const MAX_LOGS_ZWZW = 100;

// 【ZWZW新增】添加调试日志
function addDebugLog_ZWZW(msg: string, data?: unknown): void {
    const log = {
        time: new Date().toISOString(),
        msg,
        data,
    };
    debugLogs_ZWZW.push(log);
    if (debugLogs_ZWZW.length > MAX_LOGS_ZWZW) {
        debugLogs_ZWZW.shift();
    }
    // 同时输出到控制台
    console.log(`[VideoContainer_ZWZW] ${msg}`, data ?? '');
}

// 【ZWZW新增】获取调试日志（用于导出）
function getDebugLogs_ZWZW(): string {
    return JSON.stringify(debugLogs_ZWZW, null, 2);
}

// 暴露到全局，方便在控制台调用
if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).getVideoContainerLogs_ZWZW = getDebugLogs_ZWZW;
}

// 【ZWZW修复】获取标准化的 pointerId，用于状态管理和发送给 Scrcpy
function getStandardPointerId(e: PointerEvent): bigint {
    const { pointerType, pointerId: rawPointerId } = e;
    
    // 手机上 touch 事件统一使用 ScrcpyPointerId.Finger
    // 鼠标使用 Mouse 指针 ID
    if (pointerType === 'mouse') {
        return ScrcpyPointerId.Mouse;
    }
    
    // 触摸设备统一使用 Finger
    return ScrcpyPointerId.Finger;
}

const injectTouch = (action: AndroidMotionEventAction, e: PointerEvent, forcedPointerId?: bigint) => {
    if (!touchPipelineReady()) {
        addDebugLog_ZWZW('touchPipelineReady false', {
            hasScrcpy: !!state.scrcpy,
            hasCanvas: !!state.canvas,
            isCanvasReady: isCanvasReady.value,
            isFullyRendered: isFullyRendered.value,
        });
        return;
    }

    const { pointerType, pointerId: rawPointerId } = e;
    
    // 使用传入的 pointerId 或重新计算
    const pointerId = forcedPointerId ?? getStandardPointerId(e);
    
    addDebugLog_ZWZW('injectTouch called', {
        action,
        pointerType,
        rawPointerId,
        standardizedPointerId: pointerId.toString(),
        button: e.button,
        buttons: e.buttons,
        clientX: e.clientX,
        clientY: e.clientY,
    });

    const { x, y } = state.clientPositionToDevicePosition(e.clientX, e.clientY);

    addDebugLog_ZWZW('sending touch command', {
        action,
        pointerId: pointerId.toString(),
        pointerX: x,
        pointerY: y,
    });

    try {
        state.scrcpy?.controller?.injectTouch({
            action,
            pointerId,
            videoWidth: state.width!,
            videoHeight: state.height!,
            pointerX: x,
            pointerY: y,
            pressure: e.pressure,
            actionButton: MOUSE_EVENT_BUTTON_TO_ANDROID_BUTTON[e.button] ?? AndroidMotionEventButton.Primary,
            buttons: e.buttons,
        });
        addDebugLog_ZWZW('injectTouch success');
    } catch (err) {
        addDebugLog_ZWZW('injectTouch failed', { error: String(err) });
    }
};

const handlePointerDown = (e: PointerEvent) => {
    if (!touchPipelineReady() || !isPointInCanvas(e.clientX, e.clientY)) return;

    isVideoContainerFocused.value = true;
    state.fullScreenContainer?.focus();
    e.preventDefault();
    e.stopPropagation();

    // 【ZWZW修复】使用标准化的 pointerId 进行状态管理
    const pointerId = getStandardPointerId(e);
    
    addDebugLog_ZWZW('handlePointerDown', {
        rawPointerId: e.pointerId,
        standardizedPointerId: pointerId.toString(),
        activePointersSize: activePointers.size,
    });

    (e.currentTarget as HTMLDivElement)?.setPointerCapture(e.pointerId);
    activePointers.add(pointerId);
    injectTouch(AndroidMotionEventAction.Down, e, pointerId);
};

const handlePointerMove = (e: PointerEvent) => {
    // 【ZWZW修复】使用标准化的 pointerId 检查拖拽状态
    const pointerId = getStandardPointerId(e);
    const isDragging = activePointers.has(pointerId);
    
    if (isDragging) {
        if (!touchPipelineReady()) return;
    } else {
        if (!isReady() || !isPointInCanvas(e.clientX, e.clientY)) return;
    }

    e.preventDefault();
    e.stopPropagation();

    const action = isDragging && e.buttons !== 0
        ? AndroidMotionEventAction.Move
        : AndroidMotionEventAction.HoverMove;

    injectTouch(action, e, pointerId);
};

const handlePointerUp = (e: PointerEvent) => {
    if (!touchPipelineReady()) return;

    // 【ZWZW修复】使用标准化的 pointerId
    const pointerId = getStandardPointerId(e);
    const wasDragging = activePointers.has(pointerId);
    
    addDebugLog_ZWZW('handlePointerUp', {
        rawPointerId: e.pointerId,
        standardizedPointerId: pointerId.toString(),
        wasDragging,
        activePointersSize: activePointers.size,
    });
    
    if (!wasDragging && !isPointInCanvas(e.clientX, e.clientY)) return;

    e.preventDefault();
    e.stopPropagation();

    activePointers.delete(pointerId);

    try {
        (e.currentTarget as HTMLDivElement)?.releasePointerCapture(e.pointerId);
    } catch {
        // pointer capture may already be released
    }

    injectTouch(AndroidMotionEventAction.Up, e, pointerId);
};

const handlePointerLeave = (e: PointerEvent) => {
    if (!touchPipelineReady()) return;
    // 【ZWZW修复】使用标准化的 pointerId
    const pointerId = getStandardPointerId(e);
    if (activePointers.has(pointerId)) return;

    injectTouch(AndroidMotionEventAction.HoverExit, e, pointerId);
};

const handlePointerCancel = (e: PointerEvent) => {
    if (!touchPipelineReady()) return;

    // 【ZWZW修复】使用标准化的 pointerId
    const pointerId = getStandardPointerId(e);
    if (activePointers.has(pointerId)) {
        activePointers.delete(pointerId);
        injectTouch(AndroidMotionEventAction.Up, e, pointerId);
    }
};

/** 浏览器意外释放 capture 时补发 Up，防止设备端一直按住 */
const handleLostPointerCapture = (e: PointerEvent) => {
    if (!touchPipelineReady()) return;
    // 【ZWZW修复】使用标准化的 pointerId
    const pointerId = getStandardPointerId(e);
    if (!activePointers.has(pointerId)) return;
    activePointers.delete(pointerId);
    injectTouch(AndroidMotionEventAction.Up, e, pointerId);
};

const handleContextMenu = (e: MouseEvent) => {
    if (!isReady() || !isPointInCanvas(e.clientX, e.clientY)) return;
    e.preventDefault();
};

const sanitizeText = (text: string): string => {
    return text.replace(/[nN]$/g, '');
};

const handlePaste = async () => {
    if (!isReady() || !state.scrcpy || !state.scrcpy.controller) return;
    try {
        const clipboardText = await navigator.clipboard.readText();
        const sanitizedText = sanitizeText(clipboardText);

        const clipboardMessage: Omit<ScrcpySetClipboardControlMessage, 'type'> = {
            sequence: BigInt(0),
            paste: true,
            content: sanitizedText,
        };

        await state.scrcpy.controller.setClipboard(clipboardMessage);
    } catch (error) {
        console.error('粘贴到设备失败:', error);
    }
};

const handleKeyEvent = (e: KeyboardEvent) => {
    if (!isReady() || !state.keyboard) return;
    e.preventDefault();
    e.stopPropagation();

    const { type, code, ctrlKey, metaKey } = e;

    if (type === 'keydown' && (ctrlKey || metaKey)) {
        if (code === 'KeyV') {
            handlePaste();
            return;
        }
    }

    state.keyboard[type === 'keydown' ? 'down' : 'up'](code);
};

const handleFocus = () => {
    isVideoContainerFocused.value = true;
};

const handleBlur = () => {
    if (activePointers.size > 0) return;
    isVideoContainerFocused.value = false;
};

const checkRendering = () => {
    if (state.running) {
        isFullyRendered.value = true;
    }
    if (state.running && pictureReady.value && renderingCheckInterval !== undefined) {
        clearInterval(renderingCheckInterval);
        renderingCheckInterval = undefined;
    }
};

const syncPictureLayout = () => {
    if (state.width > 0 && state.height > 0) {
        placeholderAspect.value = `${state.width} / ${state.height}`;
    }
    const ready = !!(state.running && state.width > 0 && state.height > 0);
    if (ready) {
        if (!pictureReady.value) {
            pictureReady.value = true;
            nextTick(() => {
                state.updateVideoContainer();
                cancelAnimationFrame(layoutFadeRaf);
                layoutFadeRaf = requestAnimationFrame(() => {
                    state.updateVideoContainer();
                    layoutFadeRaf = requestAnimationFrame(() => {
                        videoFadedIn.value = true;
                    });
                });
            });
        }
    } else {
        pictureReady.value = false;
        videoFadedIn.value = false;
        placeholderAspect.value = '9 / 16';
    }
};

let renderingCheckInterval: ReturnType<typeof setInterval> | undefined;

const handleMouseEnter = () => {
    if (videoContainer.value) {
        videoContainer.value.focus();
        isVideoContainerFocused.value = true;
    }
};

const handleMouseLeave = () => {
    if (activePointers.size > 0) return;
    isVideoContainerFocused.value = false;
};

onMounted(() => {
    if (videoContainer.value) {
        videoContainer.value.addEventListener('wheel', handleWheel, { passive: false });
        videoContainer.value.addEventListener('focus', handleFocus);
        videoContainer.value.addEventListener('blur', handleBlur);
        videoContainer.value.addEventListener('mouseenter', handleMouseEnter);
        videoContainer.value.addEventListener('mouseleave', handleMouseLeave);
    }
    if (client.device && videoContainer.value) {
        state.setRendererContainer(videoContainer.value);
        void (async () => {
            await client.killScrcpyServerOnDevice();
            await new Promise<void>((r) => setTimeout(r, 200));
            const scrcpy = await state.start(client.device as any);
            if (!scrcpy) {
                return;
            }
            isCanvasReady.value = true;
            renderingCheckInterval = window.setInterval(() => {
                syncPictureLayout();
                checkRendering();
            }, 100);
        })();
    }

    window.addEventListener('keydown', handleKeyEvent);
    window.addEventListener('keyup', handleKeyEvent);
});

onUnmounted(() => {
    if (videoContainer.value) {
        videoContainer.value.removeEventListener('wheel', handleWheel);
        videoContainer.value.removeEventListener('focus', handleFocus);
        videoContainer.value.removeEventListener('blur', handleBlur);
        videoContainer.value.removeEventListener('mouseenter', handleMouseEnter);
        videoContainer.value.removeEventListener('mouseleave', handleMouseLeave);
    }
    window.removeEventListener('keydown', handleKeyEvent);
    window.removeEventListener('keyup', handleKeyEvent);
    if (renderingCheckInterval !== undefined) {
        clearInterval(renderingCheckInterval);
    }
    cancelAnimationFrame(layoutFadeRaf);
    activePointers.clear();
});

provide('setVideoContainerFocus', (focused: boolean) => {
    isVideoContainerFocused.value = focused;
});
</script>

<template>
    <div ref="videoWrapper" class="video-wrapper">
        <div
            ref="videoContainer"
            class="video-container"
            :class="{
                'video-container--placeholder': !pictureReady,
                'video-container--fade-in': videoFadedIn,
            }"
            :style="!pictureReady ? { aspectRatio: placeholderAspect } : undefined"
            tabindex="0"
            @pointerdown="handlePointerDown"
            @pointermove="handlePointerMove"
            @pointerup="handlePointerUp"
            @pointercancel="handlePointerCancel"
            @pointerleave="handlePointerLeave"
            @lostpointercapture="handleLostPointerCapture"
            @contextmenu="handleContextMenu"
        />
    </div>
</template>

<style scoped>
.video-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background: transparent;
}

.video-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    background-color: rgba(24, 24, 27, 0.04);
    cursor: crosshair;
    overflow: hidden;
    outline: none;
    touch-action: none;
    transition: background-color 0.35s ease;
}

.video-container--placeholder {
    width: auto;
    height: 100%;
    max-height: 100%;
    max-width: 100%;
    flex-shrink: 0;
}

.video-container--fade-in {
    background-color: transparent;
}

.video-container :deep(canvas) {
    display: block;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: auto !important;
    height: auto !important;
    max-width: calc(100% - 6px);
    max-height: calc(100% - 6px);
    background-color: transparent;
    border: 3px solid #303133;
    border-radius: 16px;
    box-sizing: border-box;
    padding: 0;
    margin: 0;
    opacity: 0;
    transition: opacity 0.45s ease;
}

.video-container--fade-in :deep(canvas) {
    opacity: 1;
}
</style>
