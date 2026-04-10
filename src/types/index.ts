// 类型定义
export type EventType = 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'mousemove' | 'wheel';

export interface RecordedEvent {
  id: string;
  type: EventType;
  timestamp: number;
  delay: number; // 距离上一个事件的延迟(ms)
  data: {
    // 键盘事件
    key?: string;
    code?: number;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    isHold?: boolean;        // ★ 长按标识（keyup 时为 true 表示长按）
    holdDuration?: number;   // ★ 按键持续时间(ms)
    // 鼠标事件
    x?: number;
    y?: number;
    button?: string;         // ★ 标准化按钮名：'left'|'middle'|'right'
    buttonCode?: number;     // ★ 原始按钮编号（调试用）
    deltaX?: number;
    deltaY?: number;
  };
}

export interface Macro {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  events: RecordedEvent[];
  settings: MacroSettings;
}

export interface MacroSettings {
  playbackSpeed: number; // 1 = 正常速度
  loopCount: number;    // 0 = 无限循环
  loopDelay: number;    // 循环间隔(ms)
  // 录制灵敏度（鼠标）
  mouseClickDebounceMs?: number;  // 鼠标点击去重阈值(ms)，默认20（低值保留连点能力）
  mouseMoveThrottleMs?: number;   // 鼠标移动节流(ms)，默认16(~60fps采样率)
}

export interface AppState {
  isRecording: boolean;
  isPlaying: boolean;
  currentMacro: Macro | null;
  savedMacros: Macro[];
}

// IPC 通道名
export const IPC_CHANNELS = {
  // 录制控制
  START_RECORDING: 'recording:start',
  STOP_RECORDING: 'recording:stop',
  EVENT_CAPTURED: 'recording:event',
  
  // 回放控制
  START_PLAYBACK: 'playback:start',
  STOP_PLAYBACK: 'playback:stop',
  PLAYBACK_PROGRESS: 'playback:progress',
  
  // 文件操作
  SAVE_MACRO: 'file:save',
  LOAD_MACRO: 'file:load',
  LIST_MACROS: 'file:list',
  DELETE_MACRO: 'file:delete',
  
  // 系统
  GET_SCREEN_SIZE: 'system:screenSize',
  SHOW_SAVE_DIALOG: 'dialog:save',
  SHOW_OPEN_DIALOG: 'dialog:open',
} as const;
