/**
 * 远程控制权限类型定义 _ZWZW
 * 
 * 【重构】从插件模块重新导出，保持向后兼容
 * 
 * @deprecated 请使用 '@/plugins/remote-features_ZWZW/permission'
 */

// 从插件模块重新导出
export {
  RemoteControlLevel_ZWZW,
  type RemoteControlConfig_ZWZW,
  type PermissionSyncMessage_ZWZW,
  createPermissionSyncMessage_ZWZW,
  parsePermissionSyncMessage_ZWZW,
  isPermissionSyncMessage_ZWZW,
} from '@/plugins/remote-features_ZWZW/permission';

// 额外的兼容性导出（原文件中的额外内容）
import { RemoteControlLevel_ZWZW, type PermissionSyncMessage_ZWZW } from '@/plugins/remote-features_ZWZW/permission';

/**
 * 控制命令消息（扩展原有命令类型）
 * 观看端 -> 分享端：发送控制命令
 */
export interface ControlCommandMessage_ZWZW {
  type: 'control_command';
  /** 命令内容 */
  command: {
    type: 'touch' | 'key';
    [key: string]: unknown;
  };
}

/**
 * 远程控制消息联合类型
 */
export type RemoteControlMessage_ZWZW = 
  | PermissionSyncMessage_ZWZW 
  | ControlCommandMessage_ZWZW;

/**
 * 获取权限级别的显示文本
 */
export function getPermissionLevelText_ZWZW(level: RemoteControlLevel_ZWZW): string {
  switch (level) {
    case RemoteControlLevel_ZWZW.READ_ONLY:
      return '只读';
    case RemoteControlLevel_ZWZW.CONTROLLABLE:
      return '可控制';
    default:
      return '未知';
  }
}

/**
 * 默认权限配置
 */
import { RemoteControlLevel_ZWZW as Level, type RemoteControlConfig_ZWZW as Config } from '@/plugins/remote-features_ZWZW/permission';

export const DEFAULT_PERMISSION_CONFIG_ZWZW: Config = {
  level: Level.CONTROLLABLE,
  allowControl: true,
};
