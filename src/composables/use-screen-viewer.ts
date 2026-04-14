/**
 * 观看端 Hook
 * 用于连接到分享端并接收视频流，发送控制命令
 * 
 * 【ZWZW修改】集成远程控制权限接收
 * - 新增权限状态管理
 * - 接收分享端的权限同步消息
 * - 提供权限状态查询接口
 * - 【ZWZW新增】集成标注同步功能
 * - 【ZWZW新增】优化视频尺寸适配
 */

import { ref, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import Peer from 'peerjs';
import type { MediaConnection, DataConnection } from 'peerjs';
import { PEER_CONFIG } from '@/services/peer-config';
import type { RemoteControlCommand } from '@/services/command-types';
// 【ZWZW新增】导入远程控制权限模块
import {
  RemoteControlLevel_ZWZW,
  type RemoteControlConfig_ZWZW,
  parsePermissionSyncMessage_ZWZW,
} from '@/services/remote-control-types_ZWZW';
// 【ZWZW新增】导入标注消息类型
import type { AnnotationSyncMessage_ZWZW } from '@/composables/use-annotation_ZWZW';

export type ViewerConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseScreenViewerReturn {
  isConnected: Ref<boolean>;
  connectionState: Ref<ViewerConnectionState>;
  error: Ref<string | null>;
  remoteStream: Ref<MediaStream | null>;
  connect: (hostPeerId: string) => Promise<void>;
  disconnect: () => void;
  sendCommand: (command: RemoteControlCommand) => void;
  // 【ZWZW新增】权限相关返回值
  permissionConfig: Ref<RemoteControlConfig_ZWZW>;
  canControl: Ref<boolean>;
  hasReceivedPermission: Ref<boolean>;
  // 【ZWZW新增】标注相关
  sendAnnotation_ZWZW: (msg: AnnotationSyncMessage_ZWZW) => void;
  onAnnotationMessage_ZWZW: Ref<((data: unknown) => boolean) | null>;
  // 【ZWZW新增】视频尺寸信息
  videoWidth: Ref<number>;
  videoHeight: Ref<number>;
  // 【ZWZW新增】设备尺寸信息
  deviceWidth: Ref<number>;
  deviceHeight: Ref<number>;
  deviceRotation: Ref<number>;
  // 【新增】画质控制 - 支持帧率和分辨率缩放
  sendQualityRequest: (frameRate: number, scale?: number) => void;
}

export function useScreenViewer(): UseScreenViewerReturn {
  const isConnected = ref(false);
  const connectionState = ref<ViewerConnectionState>('idle');
  const error = ref<string | null>(null);
  const remoteStream = ref<MediaStream | null>(null);
  
  // 【ZWZW新增】权限状态
  const permissionConfig = ref<RemoteControlConfig_ZWZW>({
    level: RemoteControlLevel_ZWZW.READ_ONLY,
    allowControl: false,
  });
  const canControl = ref(false);
  const hasReceivedPermission = ref(false);
  
  // 【ZWZW新增】标注相关
  const onAnnotationMessage_ZWZW = ref<((data: unknown) => boolean) | null>(null);
  
  // 【ZWZW新增】视频尺寸信息
  const videoWidth = ref(0);
  const videoHeight = ref(0);
  // 【ZWZW新增】设备尺寸信息（来自分享端）
  const deviceWidth = ref(0);
  const deviceHeight = ref(0);
  const deviceRotation = ref(0);
  
  let peer: Peer | null = null;
  let call: MediaConnection | null = null;
  let dataConn: DataConnection | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * 连接到分享端
   */
  async function connect(remotePeerId: string): Promise<void> {
    // 清理旧连接
    if (peer && !peer.destroyed) {
      peer.destroy();
    }
    if (timeout) {
      clearTimeout(timeout);
    }

    error.value = null;
    connectionState.value = 'connecting';
    isConnected.value = false;
    remoteStream.value = null;

    return new Promise((resolve, reject) => {
      peer = new Peer(PEER_CONFIG);

      // 30 秒超时
      timeout = setTimeout(() => {
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
        connectionState.value = 'error';
        error.value = '连接超时，请检查分享码是否正确';
        reject(new Error('连接超时'));
      }, 30000);

      // ========== 信令事件 1: 本地 Peer 连接成功 ==========
      peer.on('open', (id) => {
        console.log('[Viewer] 已连接信令服务器，本地 ID:', id);

        // ========== 信令事件 2: 建立数据通道 ==========
        dataConn = peer!.connect(remotePeerId, { reliable: true });
        
        dataConn.on('open', () => {
          console.log('[Viewer] 数据通道已建立');
        });
        
        // 【ZWZW新增】接收权限同步消息和标注消息
        dataConn.on('data', (data) => {
          // 首先检查权限消息
          const permMessage = parsePermissionSyncMessage_ZWZW(data);
          if (permMessage) {
            permissionConfig.value = {
              level: permMessage.level,
              allowControl: permMessage.allowControl,
            };
            canControl.value = permMessage.allowControl;
            hasReceivedPermission.value = true;
            // 【ZWZW新增】提取设备尺寸信息
            if (permMessage.deviceWidth && permMessage.deviceHeight) {
              deviceWidth.value = permMessage.deviceWidth;
              deviceHeight.value = permMessage.deviceHeight;
              deviceRotation.value = permMessage.rotation ?? 0;
            }
            return;
          }
          
          // 【ZWZW新增】处理标注消息
          if (onAnnotationMessage_ZWZW.value) {
            const handled = onAnnotationMessage_ZWZW.value(data);
            if (handled) return;
          }
        });

        dataConn.on('error', (err) => {
          console.warn('[Viewer] 数据通道错误:', err);
        });

        dataConn.on('close', () => {
          console.log('[Viewer] 数据通道关闭');
          // 【ZWZW新增】重置权限状态
          canControl.value = false;
          hasReceivedPermission.value = false;
        });

        // 创建 dummy 视频流用于 SDP 协商
        // WebRTC 需要双向媒体协商，即使观看端不发送实际视频
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        const dummyStream = canvas.captureStream(1);

        // ========== 信令事件 3: 发起视频请求 ==========
        call = peer!.call(remotePeerId, dummyStream);
        console.log('[Viewer] 发起视频请求，目标:', remotePeerId);

        if (!call) {
          if (timeout) clearTimeout(timeout);
          connectionState.value = 'error';
          error.value = '无法连接到分享端';
          reject(new Error('无法连接到分享端'));
          return;
        }

        // ========== 信令事件 4: 收到远程视频流 ==========
        call.on('stream', (stream) => {
          console.log('[Viewer] 收到远程视频流');
          console.log('[Viewer] 视频轨道数:', stream.getVideoTracks().length);
          console.log('[Viewer] 音频轨道数:', stream.getAudioTracks().length);
          
          const videoTracks = stream.getVideoTracks();
          if (videoTracks.length > 0) {
            const track = videoTracks[0];
            console.log('[Viewer] 视频轨道状态:', track.readyState, '启用:', track.enabled);
            const settings = track.getSettings();
            console.log('[Viewer] 视频设置:', settings);
            
            // 【ZWZW新增】获取视频尺寸
            if (settings.width && settings.height) {
              videoWidth.value = settings.width;
              videoHeight.value = settings.height;
            }
            
            // 【ZWZW新增】监听视频轨道尺寸变化
            track.addEventListener('resize', () => {
              const newSettings = track.getSettings();
              if (newSettings.width && newSettings.height) {
                videoWidth.value = newSettings.width;
                videoHeight.value = newSettings.height;
              }
            });
          }
          
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }

          remoteStream.value = stream;
          isConnected.value = true;
          connectionState.value = 'connected';
          error.value = null;
          resolve();
        });

        call.on('error', (err) => {
          console.error('[Viewer] 媒体连接错误:', err);
          if (timeout) clearTimeout(timeout);
          connectionState.value = 'error';
          error.value = err.message;
          reject(err);
        });

        call.on('close', () => {
          console.log('[Viewer] 媒体连接关闭');
          isConnected.value = false;
          connectionState.value = 'disconnected';
          remoteStream.value = null;
        });
      });

      // ========== 信令事件 5: 连接错误 ==========
      peer.on('error', (err) => {
        console.error('[Viewer] Peer 错误:', err);
        if (timeout) clearTimeout(timeout);
        connectionState.value = 'error';

        if (err.type === 'peer-unavailable') {
          error.value = '找不到该分享，可能已停止分享或分享码错误';
        } else if (err.type === 'network') {
          error.value = '网络连接失败';
        } else if (err.type === 'server-error') {
          error.value = '信令服务器连接失败';
        } else {
          error.value = err.message;
        }
        reject(err);
      });

      peer.on('disconnected', () => {
        console.warn('[Viewer] Peer 断开连接');
        if (isConnected.value) {
          connectionState.value = 'disconnected';
        }
      });
    });
  }

  /**
   * 断开连接
   */
  function disconnect(): void {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }

    dataConn?.close();
    dataConn = null;

    call?.close();
    call = null;

    peer?.destroy();
    peer = null;

    isConnected.value = false;
    connectionState.value = 'idle';
    remoteStream.value = null;
    error.value = null;
    
    // 【ZWZW新增】重置权限状态
    canControl.value = false;
    hasReceivedPermission.value = false;
    permissionConfig.value = {
      level: RemoteControlLevel_ZWZW.READ_ONLY,
      allowControl: false,
    };

    console.log('[Viewer] 已断开连接');
  }

  /**
   * 发送触摸事件
   * 【ZWZW修改】添加权限检查
   */
  function sendCommand(command: RemoteControlCommand): void {
    // 【ZWZW新增】检查控制权限
    if (!canControl.value) {
      console.warn('[Viewer_ZWZW] 无控制权限，命令已阻止');
      return;
    }
    
    if (!dataConn?.open) {
      console.warn('[Viewer] 数据通道未建立，无法发送命令');
      return;
    }
    dataConn.send(command);
  }
  
  /**
   * 【ZWZW新增】发送标注消息
   * 标注消息不需要控制权限，双方都可以绘制
   */
  function sendAnnotation_ZWZW(msg: AnnotationSyncMessage_ZWZW): void {
    if (!dataConn?.open) {
      console.warn('[Viewer_ZWZW] 数据通道未建立，无法发送标注');
      return;
    }
    dataConn.send(msg);
  }

  /**
   * 【新增】发送画质请求 - 支持帧率和分辨率缩放
   */
  function sendQualityRequest(frameRate: number, scale: number = 1): void {
    if (!dataConn?.open) {
      console.warn('[Viewer] 数据通道未建立，无法发送画质请求');
      return;
    }
    dataConn.send({
      type: 'quality_request',
      frameRate,
      scale, // 分辨率缩放比例 0.5, 0.75, 1
    });
  }

  onUnmounted(() => {
    disconnect();
  });

  return {
    isConnected,
    connectionState,
    error,
    remoteStream,
    connect,
    disconnect,
    sendCommand,
    // 【ZWZW新增】权限相关返回值
    permissionConfig,
    canControl,
    hasReceivedPermission,
    // 【ZWZW新增】标注相关
    sendAnnotation_ZWZW,
    onAnnotationMessage_ZWZW,
    // 【ZWZW新增】视频尺寸
    videoWidth,
    videoHeight,
    // 【ZWZW新增】设备尺寸
    deviceWidth,
    deviceHeight,
    deviceRotation,
    // 【新增】画质控制
    sendQualityRequest,
  };
}
