/**
 * 远程控制权限管理 Hook _ZWZW
 * 
 * 【重构】从插件模块重新导出，保持向后兼容
 * 
 * @deprecated 请使用 '@/plugins/remote-features_ZWZW/permission'
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import {
  RemoteControlLevel_ZWZW,
  type RemoteControlConfig_ZWZW,
  type PermissionSyncMessage_ZWZW,
  createPermissionSyncMessage_ZWZW,
} from '@/plugins/remote-features_ZWZW/permission';

// ============ 分享端权限管理 ============

export interface UseSharePermissionReturn_ZWZW {
  permissionConfig: Ref<RemoteControlConfig_ZWZW>;
  allowControl: ComputedRef<boolean>;
  currentLevel: ComputedRef<RemoteControlLevel_ZWZW>;
  setPermissionLevel: (level: RemoteControlLevel_ZWZW) => void;
  toggleControlPermission: () => void;
  createSyncMessage: (deviceWidth?: number, deviceHeight?: number, rotation?: number) => PermissionSyncMessage_ZWZW;
  resetToDefault: () => void;
}

export function useSharePermission_ZWZW(): UseSharePermissionReturn_ZWZW {
  const permissionConfig = ref<RemoteControlConfig_ZWZW>({
    level: RemoteControlLevel_ZWZW.CONTROLLABLE,
    allowControl: true,
  });
  
  const allowControl = computed(() => permissionConfig.value.allowControl);
  const currentLevel = computed(() => permissionConfig.value.level);
  
  function setPermissionLevel(level: RemoteControlLevel_ZWZW): void {
    permissionConfig.value.level = level;
    permissionConfig.value.allowControl = level === RemoteControlLevel_ZWZW.CONTROLLABLE;
  }
  
  function toggleControlPermission(): void {
    const newAllow = !permissionConfig.value.allowControl;
    permissionConfig.value.allowControl = newAllow;
    permissionConfig.value.level = newAllow 
      ? RemoteControlLevel_ZWZW.CONTROLLABLE 
      : RemoteControlLevel_ZWZW.READ_ONLY;
  }
  
  function createSyncMessage(
    deviceWidth?: number,
    deviceHeight?: number,
    rotation?: number
  ): PermissionSyncMessage_ZWZW {
    return createPermissionSyncMessage_ZWZW(
      permissionConfig.value.level,
      permissionConfig.value.allowControl,
      deviceWidth,
      deviceHeight,
      rotation
    );
  }
  
  function resetToDefault(): void {
    permissionConfig.value = {
      level: RemoteControlLevel_ZWZW.CONTROLLABLE,
      allowControl: true,
    };
  }
  
  return {
    permissionConfig,
    allowControl,
    currentLevel,
    setPermissionLevel,
    toggleControlPermission,
    createSyncMessage,
    resetToDefault,
  };
}

// ============ 观看端权限接收 ============

export interface UseViewerPermissionReturn_ZWZW {
  permissionConfig: Ref<RemoteControlConfig_ZWZW>;
  canControl: ComputedRef<boolean>;
  hasReceivedPermission: Ref<boolean>;
  handlePermissionMessage: (data: unknown) => boolean;
  reset: () => void;
}

export function useViewerPermission_ZWZW(): UseViewerPermissionReturn_ZWZW {
  const permissionConfig = ref<RemoteControlConfig_ZWZW>({
    level: RemoteControlLevel_ZWZW.READ_ONLY,
    allowControl: false,
  });
  const hasReceivedPermission = ref(false);
  
  const canControl = computed(() => permissionConfig.value.allowControl);
  
  function handlePermissionMessage(data: unknown): boolean {
    const msg = data as Record<string, unknown>;
    if (msg?.type !== 'permission_sync') return false;
    
    permissionConfig.value = {
      level: msg.level as RemoteControlLevel_ZWZW,
      allowControl: !!msg.allowControl,
    };
    hasReceivedPermission.value = true;
    return true;
  }
  
  function reset(): void {
    permissionConfig.value = {
      level: RemoteControlLevel_ZWZW.READ_ONLY,
      allowControl: false,
    };
    hasReceivedPermission.value = false;
  }
  
  return {
    permissionConfig,
    canControl,
    hasReceivedPermission,
    handlePermissionMessage,
    reset,
  };
}

// ============ 权限检查包装器 ============

export function createPermissionCheckedSender_ZWZW(
  canControl: ComputedRef<boolean>,
  sendCommand: (command: unknown) => void
): (command: unknown) => boolean {
  return (command: unknown) => {
    if (!canControl.value) {
      console.warn('[ZWZW] 无控制权限，命令已阻止');
      return false;
    }
    sendCommand(command);
    return true;
  };
}
