/**
 * 分享端 Hook
 * 用于捕获 Scrcpy canvas 视频流并通过 WebRTC 分享给远程观看者
 * 
 * 【ZWZW修改】集成远程控制权限管理
 * - 新增 allowRemoteControl 参数控制远程控制权限
 * - 观看者连接时自动同步权限设置
 * - 权限变更时通知所有观看者
 * - 【ZWZW新增】集成标注同步功能
 * - 【ZWZW修复】改为单例模式，解决画笔同步问题
 */

import { ref, shallowRef, computed } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import Peer from 'peerjs';
import type { MediaConnection, DataConnection } from 'peerjs';
import { PEER_CONFIG, generateShareId } from '@/services/peer-config';
import { deserializeCommand, isTouchCommand, isKeyCommand } from '@/services/command-types';
import { normalizedToDevice } from '@/services/coord-utils';
import scrcpyState from '@/components/Scrcpy/scrcpy-state';
// 【ZWZW新增】导入 Android 键码和触摸事件常量
import { AndroidKeyCode, AndroidKeyEventAction, AndroidMotionEventButton, ScrcpyPointerId } from '@yume-chan/scrcpy';
// 【ZWZW新增】导入远程控制权限模块
import {
  RemoteControlLevel_ZWZW,
  type RemoteControlConfig_ZWZW,
  createPermissionSyncMessage_ZWZW,
} from '@/services/remote-control-types_ZWZW';
// 【ZWZW新增】导入标注消息类型
import type { AnnotationSyncMessage_ZWZW } from '@/composables/use-annotation_ZWZW';

export type ConnectionState = 'idle' | 'initializing' | 'ready' | 'error';

export interface ViewerConnection {
  id: string;
  mediaConnection: MediaConnection;
  dataConnection: DataConnection | null;
  connectedAt: Date;
}

// 【ZWZW修复】画笔线条类型
export interface AnnotationStroke_ZWZW {
  id: string;
  color: string;
  lineWidth: number;
  points: Array<{ x: number; y: number }>;
  timestamp: number;
  source: 'local' | 'remote';
}

export interface UseScreenShareReturn {
  isSharing: Ref<boolean>;
  peerId: Ref<string | null>;
  viewerCount: Ref<number>;
  connectionState: Ref<ConnectionState>;
  error: Ref<string | null>;
  startSharing: (canvas: HTMLCanvasElement | HTMLVideoElement, frameRate?: number) => Promise<void>;
  stopSharing: () => void;
  viewers: ShallowRef<ViewerConnection[]>;
  // 【ZWZW新增】权限相关返回值
  permissionConfig: Ref<RemoteControlConfig_ZWZW>;
  allowRemoteControl: Ref<boolean>;
  setAllowRemoteControl: (allow: boolean) => void;
  // 【ZWZW新增】标注相关
  sendAnnotation_ZWZW: (msg: AnnotationSyncMessage_ZWZW) => void;
  addLocalStroke_ZWZW: (stroke: AnnotationStroke_ZWZW) => void;
  clearAllStrokes_ZWZW: () => void;
  annotationStrokes_ZWZW: Ref<AnnotationStroke_ZWZW[]>;
}

// 【ZWZW修复】全局单例状态
const shareState = {
  isSharing: ref(false),
  peerId: ref<string | null>(null),
  connectionState: ref<ConnectionState>('idle'),
  error: ref<string | null>(null),
  viewers: shallowRef<ViewerConnection[]>([]),
  permissionConfig: ref<RemoteControlConfig_ZWZW>({
    level: RemoteControlLevel_ZWZW.CONTROLLABLE,
    allowControl: true,
  }),
  allowRemoteControl: ref(true),
  annotationStrokes_ZWZW: ref<AnnotationStroke_ZWZW[]>([]),
  peer: null as Peer | null,
  mediaStream: null as MediaStream | null,
  mediaConnections: [] as MediaConnection[],
  dataConnections: [] as DataConnection[],
};

export function useScreenShare(): UseScreenShareReturn {
  const viewerCount = computed(() => shareState.viewers.value.length);
  
  // 【ZWZW修复】设置远程控制权限
  function setAllowRemoteControl(allow: boolean): void {
    shareState.allowRemoteControl.value = allow;
    shareState.permissionConfig.value = {
      level: allow ? RemoteControlLevel_ZWZW.CONTROLLABLE : RemoteControlLevel_ZWZW.READ_ONLY,
      allowControl: allow,
    };
    
    // 同步权限给所有观看者
    broadcastPermission_ZWZW();
  }
  
  // 【ZWZW修复】广播权限变更给所有观看者
  function broadcastPermission_ZWZW(): void {
    if (shareState.dataConnections.length === 0) return;
    
    const message = createPermissionSyncMessage_ZWZW(
      shareState.permissionConfig.value.level,
      shareState.permissionConfig.value.allowControl,
      scrcpyState.width,
      scrcpyState.height,
      scrcpyState.rotation
    );
    
    shareState.dataConnections.forEach(conn => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }
  
  // 【ZWZW修复】发送标注消息给所有观看者
  function sendAnnotation_ZWZW(msg: AnnotationSyncMessage_ZWZW): void {
    if (shareState.dataConnections.length === 0) return;
    
    shareState.dataConnections.forEach(conn => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }
  
  // 【ZWZW修复】添加本地画笔线条
  function addLocalStroke_ZWZW(stroke: AnnotationStroke_ZWZW): void {
    stroke.source = 'local';
    shareState.annotationStrokes_ZWZW.value.push(stroke);
  }
  
  // 【ZWZW修复】清除所有画笔
  function clearAllStrokes_ZWZW(): void {
    shareState.annotationStrokes_ZWZW.value = [];
  }
  
  // 【ZWZW修复】处理远程标注消息（来自观看者）
  function handleRemoteAnnotation_ZWZW(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    
    const msg = data as Record<string, unknown>;
    if (msg.type !== 'annotation') return false;
    
    const action = msg.action as string;
    
    if (action === 'clear_all') {
      shareState.annotationStrokes_ZWZW.value = [];
      return true;
    }
    
    if (action === 'clear') {
      if (shareState.annotationStrokes_ZWZW.value.length > 0) {
        shareState.annotationStrokes_ZWZW.value.pop();
      }
      return true;
    }
    
    if (action === 'stroke' && msg.data) {
      const stroke = msg.data as AnnotationStroke_ZWZW;
      stroke.source = 'remote';
      shareState.annotationStrokes_ZWZW.value.push(stroke);
      
      // 【ZWZW重要】广播给其他观看者（不包括发送者）
      shareState.dataConnections.forEach(conn => {
        if (conn.open) {
          conn.send(msg);
        }
      });
      return true;
    }
    
    return false;
  }

  // 【新增】处理画质请求 - 支持帧率和分辨率缩放
  function handleQualityRequest_ZWZW(frameRate: number, scale: number, mediaConn: MediaConnection): void {
    // 尝试通过 WebRTC API 调整编码参数
    try {
      const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
      if (pc) {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender) {
          const parameters = videoSender.getParameters();
          if (parameters.encodings && parameters.encodings.length > 0) {
            // 设置帧率
            parameters.encodings[0].maxFramerate = frameRate;
            // 设置分辨率缩放 (scaleResolutionDownBy)
            // 注意：这是发送端缩小分辨率，接收端会收到缩小后的视频
            if (scale > 0 && scale <= 1) {
              parameters.encodings[0].scaleResolutionDownBy = 1 / scale;
            }
            videoSender.setParameters(parameters);
          }
        }
      }
    } catch (e) {
      // 部分浏览器可能不支持，忽略错误
      console.warn('[Host] 调整画质参数失败:', e);
    }
  }

  // 【ZWZW修复】处理来自观看者的控制命令
  function handleCommand(data: unknown): void {
    const command = typeof data === 'string' ? deserializeCommand(data) : data as any;
    if (!command) {
      console.warn('[Host] 收到无效的控制命令:', data);
      return;
    }

    // 检查控制权限
    if (!shareState.allowRemoteControl.value) {
      console.warn('[Host_ZWZW] 当前禁止远程控制，命令已忽略:', command);
      return;
    }

    // console.log('[Host] 收到控制命令:', command); // 【ZWZW调试】打印控制命令

    if (isTouchCommand(command)) {
      // 【ZWZW重要】使用归一化坐标转换为设备坐标
      // 【ZWZW修复】检查设备尺寸是否有效
      if (scrcpyState.width <= 0 || scrcpyState.height <= 0) {
        console.warn('[Host_ZWZW] 设备尺寸无效，无法执行触摸命令');
        return;
      }
      
      const deviceCoords = normalizedToDevice(
        command.x,
        command.y,
        scrcpyState.width,
        scrcpyState.height,
        scrcpyState.rotation
      );

      const controller = scrcpyState.scrcpy?.controller;
      if (controller) {
        const actionMap: Record<string, number> = {
          'down': 0,
          'move': 2,
          'up': 1,
        };
        
        // 【ZWZW修复】使用正确的触摸参数
        // 重要：使用 ScrcpyPointerId.Finger 模拟手指触摸，Android 只接受特定的 pointerId
        const isPressed = command.action !== 'up';
        controller.injectTouch({
            action: actionMap[command.action] as any,
            pointerId: ScrcpyPointerId.Finger,
            pointerX: deviceCoords.x,
            pointerY: deviceCoords.y,
            pressure: isPressed ? 1 : 0,
            actionButton: AndroidMotionEventButton.Primary,
            buttons: isPressed ? AndroidMotionEventButton.Primary : 0,
            videoWidth: scrcpyState.width,
            videoHeight: scrcpyState.height
        });
      } else {
        console.warn('[Host_ZWZW] 控制器不可用');
      }
    } else if (isKeyCommand(command)) {
      const controller = scrcpyState.scrcpy?.controller;
      if (!controller) {
        console.warn('[Host_ZWZW] 控制器不可用，无法处理按键');
        return;
      }

      if (command.key === 'back') {
        // 【ZWZW修复】返回键使用 backOrScreenOn 方法
        controller.backOrScreenOn(AndroidKeyEventAction.Down);
        setTimeout(() => {
          controller.backOrScreenOn(AndroidKeyEventAction.Up);
        }, 50);
      } else if (command.key === 'home') {
        controller.injectKeyCode({
          action: AndroidKeyEventAction.Down,
          keyCode: AndroidKeyCode.AndroidHome,
          repeat: 0,
          metaState: 0,
        });
        setTimeout(() => {
          controller.injectKeyCode({
            action: AndroidKeyEventAction.Up,
            keyCode: AndroidKeyCode.AndroidHome,
            repeat: 0,
            metaState: 0,
          });
        }, 50);
      } else if (command.key === 'recents') {
        controller.injectKeyCode({
          action: AndroidKeyEventAction.Down,
          keyCode: AndroidKeyCode.AndroidAppSwitch,
          repeat: 0,
          metaState: 0,
        });
        setTimeout(() => {
          controller.injectKeyCode({
            action: AndroidKeyEventAction.Up,
            keyCode: AndroidKeyCode.AndroidAppSwitch,
            repeat: 0,
            metaState: 0,
          });
        }, 50);
      }
    }
  }

  // 开始分享屏幕
  async function startSharing(
    canvas: HTMLCanvasElement | HTMLVideoElement,
    frameRate: number = 30
  ): Promise<void> {
    if (shareState.isSharing.value) {
      console.warn('[Host] 已经在分享中');
      return;
    }

    try {
      shareState.connectionState.value = 'initializing';
      shareState.error.value = null;

      // 捕获视频流
      if (canvas instanceof HTMLCanvasElement) {
        shareState.mediaStream = canvas.captureStream(frameRate);
      } else {
        throw new Error('不支持的元素类型，请确保使用 Canvas 渲染器');
      }

      if (!shareState.mediaStream) {
        throw new Error('无法获取视频流');
      }

      // 清理旧连接
      if (shareState.peer && !shareState.peer.destroyed) {
        shareState.peer.destroy();
      }

      const customId = generateShareId();
      
      await new Promise<void>((resolve, reject) => {
        shareState.peer = new Peer(customId, PEER_CONFIG);

        shareState.peer!.on('open', (id) => {
          console.log('[Host] 已连接信令服务器，分享码:', id);
          shareState.peerId.value = id;
          shareState.isSharing.value = true;
          shareState.connectionState.value = 'ready';
          resolve();
        });

        shareState.peer!.on('call', (call: MediaConnection) => {
          console.log('[Host] 收到视频请求，来自:', call.peer);
          
          if (!shareState.mediaStream) {
            call.close();
            return;
          }

          call.answer(shareState.mediaStream);
          shareState.mediaConnections.push(call);

          const viewerConnection: ViewerConnection = {
            id: call.peer,
            mediaConnection: call,
            dataConnection: null,
            connectedAt: new Date(),
          };
          shareState.viewers.value = [...shareState.viewers.value, viewerConnection];

          call.on('close', () => {
            console.log('[Host] 媒体连接关闭:', call.peer);
            const idx = shareState.mediaConnections.indexOf(call);
            if (idx > -1) shareState.mediaConnections.splice(idx, 1);
            shareState.viewers.value = shareState.viewers.value.filter(v => v.id !== call.peer);
          });

          call.on('error', (err) => {
            console.error('[Host] 媒体连接错误:', err);
            const idx = shareState.mediaConnections.indexOf(call);
            if (idx > -1) shareState.mediaConnections.splice(idx, 1);
            shareState.viewers.value = shareState.viewers.value.filter(v => v.id !== call.peer);
          });
        });

        shareState.peer!.on('connection', (dataConn: DataConnection) => {
          console.log('[Host] 收到数据连接，来自:', dataConn.peer);
          shareState.dataConnections.push(dataConn);

          const viewer = shareState.viewers.value.find(v => v.id === dataConn.peer);
          if (viewer) {
            viewer.dataConnection = dataConn;
          }

          dataConn.on('open', () => {
            const permMessage = createPermissionSyncMessage_ZWZW(
              shareState.permissionConfig.value.level,
              shareState.permissionConfig.value.allowControl,
              scrcpyState.width,
              scrcpyState.height,
              scrcpyState.rotation
            );
            dataConn.send(permMessage);
          });

          dataConn.on('data', (data) => {
            // 【ZWZW修复】正确过滤权限同步消息（类型是 'permission_sync'）
            const permMsg = data as Record<string, unknown>;
            if (permMsg && (permMsg.type === 'permission_sync' || permMsg.type === 'permission')) {
              return;
            }

            // 【新增】处理画质请求 - 支持分辨率缩放
            if (permMsg && permMsg.type === 'quality_request') {
              // 找到对应的媒体连接
              const viewer = shareState.viewers.value.find(v => v.id === dataConn.peer);
              if (viewer?.mediaConnection) {
                handleQualityRequest_ZWZW(
                  permMsg.frameRate as number,
                  (permMsg.scale as number) || 1,
                  viewer.mediaConnection
                );
              }
              return;
            }

            if (handleRemoteAnnotation_ZWZW(data)) {
              return;
            }

            handleCommand(data);
          });

          dataConn.on('close', () => {
            console.log('[Host] 数据连接关闭:', dataConn.peer);
            const idx = shareState.dataConnections.indexOf(dataConn);
            if (idx > -1) shareState.dataConnections.splice(idx, 1);
          });

          dataConn.on('error', (err) => {
            console.error('[Host] 数据连接错误:', err);
            const idx = shareState.dataConnections.indexOf(dataConn);
            if (idx > -1) shareState.dataConnections.splice(idx, 1);
          });
        });

        shareState.peer!.on('error', (err) => {
          console.error('[Host] Peer 错误:', err);
          
          if (err.type === 'unavailable-id') {
            shareState.peer?.destroy();
            shareState.peer = new Peer(PEER_CONFIG);
            shareState.peer.on('open', (id) => {
              shareState.peerId.value = id;
              shareState.isSharing.value = true;
              shareState.connectionState.value = 'ready';
              resolve();
            });
          } else {
            shareState.error.value = err.message;
            shareState.connectionState.value = 'error';
            reject(err);
          }
        });

        shareState.peer!.on('disconnected', () => {
          console.warn('[Host] Peer 断开连接，尝试重连...');
          shareState.peer?.reconnect();
        });
      });

      console.log('[Host] 开始分享，分享码:', shareState.peerId.value);

    } catch (err) {
      console.error('[Host] 启动分享失败:', err);
      shareState.error.value = err instanceof Error ? err.message : '未知错误';
      shareState.connectionState.value = 'error';
      stopSharing();
      throw err;
    }
  }

  // 停止分享
  function stopSharing(): void {
    shareState.mediaConnections.forEach(c => c.close());
    shareState.mediaConnections.length = 0;
    
    shareState.dataConnections.forEach(c => c.close());
    shareState.dataConnections.length = 0;

    shareState.mediaStream?.getTracks().forEach(t => t.stop());
    shareState.mediaStream = null;

    shareState.peer?.destroy();
    shareState.peer = null;

    shareState.isSharing.value = false;
    shareState.peerId.value = null;
    shareState.connectionState.value = 'idle';
    shareState.error.value = null;
    shareState.viewers.value = [];
    
    // 【ZWZW修复】停止分享时重置权限状态为默认值（允许控制）
    // 这样下次分享时默认是允许控制的状态
    shareState.allowRemoteControl.value = true;
    shareState.permissionConfig.value = {
      level: RemoteControlLevel_ZWZW.CONTROLLABLE,
      allowControl: true,
    };
    
    // 【ZWZW修复】停止分享时不清除画笔，画笔需要手动清除
    // shareState.annotationStrokes_ZWZW.value = [];

    console.log('[Host] 停止分享，权限已重置为默认值（允许控制）');
  }

  return {
    isSharing: shareState.isSharing,
    peerId: shareState.peerId,
    viewerCount,
    connectionState: shareState.connectionState,
    error: shareState.error,
    startSharing,
    stopSharing,
    viewers: shareState.viewers,
    permissionConfig: shareState.permissionConfig,
    allowRemoteControl: shareState.allowRemoteControl,
    setAllowRemoteControl,
    sendAnnotation_ZWZW,
    addLocalStroke_ZWZW,
    clearAllStrokes_ZWZW,
    annotationStrokes_ZWZW: shareState.annotationStrokes_ZWZW,
  };
}
