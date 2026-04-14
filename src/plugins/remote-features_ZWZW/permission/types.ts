/**
 * 远程控制权限模块 - 类型定义
 * 
 * 独立模块，可与上游代码零耦合合并
 */

export enum RemoteControlLevel {
  READ_ONLY = 'read_only',
  CONTROLLABLE = 'controllable',
}

export interface RemoteControlConfig {
  level: RemoteControlLevel;
  allowControl: boolean;
}

export interface PermissionSyncMessage {
  type: 'permission_sync';
  level: RemoteControlLevel;
  allowControl: boolean;
  deviceWidth?: number;
  deviceHeight?: number;
  rotation?: number;
}

// 为兼容性保留 ZWZW 后缀的类型别名
export const RemoteControlLevel_ZWZW = RemoteControlLevel;
export type RemoteControlConfig_ZWZW = RemoteControlConfig;
export type PermissionSyncMessage_ZWZW = PermissionSyncMessage;

/**
 * 创建权限同步消息
 */
export function createPermissionSyncMessage(
  level: RemoteControlLevel,
  allowControl: boolean,
  deviceWidth?: number,
  deviceHeight?: number,
  rotation?: number
): PermissionSyncMessage {
  return {
    type: 'permission_sync',
    level,
    allowControl,
    deviceWidth,
    deviceHeight,
    rotation,
  };
}

// 为兼容性保留 ZWZW 后缀的函数别名
export const createPermissionSyncMessage_ZWZW = createPermissionSyncMessage;

/**
 * 解析权限同步消息
 */
export function parsePermissionSyncMessage(data: unknown): PermissionSyncMessage | null {
  if (!data || typeof data !== 'object') return null;
  
  const msg = data as Record<string, unknown>;
  if (msg.type !== 'permission_sync') return null;
  
  return {
    type: 'permission_sync',
    level: msg.level as RemoteControlLevel,
    allowControl: !!msg.allowControl,
    deviceWidth: msg.deviceWidth as number | undefined,
    deviceHeight: msg.deviceHeight as number | undefined,
    rotation: msg.rotation as number | undefined,
  };
}

// 为兼容性保留 ZWZW 后缀的函数别名
export const parsePermissionSyncMessage_ZWZW = parsePermissionSyncMessage;

/**
 * 检查是否为权限同步消息
 */
export function isPermissionSyncMessage(data: unknown): data is PermissionSyncMessage {
  return parsePermissionSyncMessage(data) !== null;
}

export const isPermissionSyncMessage_ZWZW = isPermissionSyncMessage;
