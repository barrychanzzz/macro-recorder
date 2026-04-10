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
    isHold?: boolean;
    holdDuration?: number;
    // 鼠标事件
    x?: number;
    y?: number;
    button?: string;         // 'left' | 'middle' | 'right'
    buttonCode?: number;
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
  playbackSpeed: number;
  loopCount: number;
  loopDelay: number;
  mouseClickDebounceMs?: number;
  mouseMoveThrottleMs?: number;
}
