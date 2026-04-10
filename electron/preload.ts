import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // 录制
  startRecording: () => Promise<{ success: boolean }>;
  stopRecording: () => Promise<{ success: boolean; events: any[] }>;
  setSensitivity: (config: { keyDebounceMs?: number; mouseClickDebounceMs?: number; mouseMoveThrottleMs?: number }) => Promise<{ success: boolean }>;

  // 回放
  startPlayback: (events: any[], settings: any) => Promise<{ success: boolean; error?: string }>;
  stopPlayback: () => Promise<{ success: boolean }>;

  // 事件监听（返回清理函数）
  onRecordingEvent: (callback: (event: any) => void) => () => void;
  onPlaybackProgress: (callback: (progress: any) => void) => () => void;

  // 文件操作
  saveMacro: (macro: any) => Promise<{ success: boolean; filePath?: string }>;
  loadMacro: () => Promise<{ success: boolean; macro?: any; error?: string }>;
  listMacros: () => Promise<any[]>;
  deleteMacro: (id: string) => Promise<{ success: boolean }>;

  // 系统
  getScreenSize: () => Promise<{ width: number; height: number }>;

  // 快捷键事件（主进程 globalShortcut 触发后转发）
  // toggle-record: 已废弃（由 recording-stopped / request-start-record 替代），保留兼容
  onShortcutToggleRecord: (callback: () => void) => () => void;
  onShortcutTogglePlayback: (callback: () => void) => () => void;
  // 主进程已停止录制并进入冷却期
  onRecordingStopped: (callback: (data: { events: any[] }) => void) => () => void;
  // 主进程请求开始新录制（需前端确认）
  onRequestStartRecord: (callback: () => void) => () => void;
}

const electronAPI: ElectronAPI = {
  // 录制控制
  startRecording: () => ipcRenderer.invoke('recording:start'),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  setSensitivity: (config) => ipcRenderer.invoke('recording:setSensitivity', config),

  // 回放控制
  startPlayback: (events, settings) => ipcRenderer.invoke('playback:start', { events, settings }),
  stopPlayback: () => ipcRenderer.invoke('playback:stop'),

  // 事件监听（返回清理函数供 useEffect 卸载）
  onRecordingEvent: (callback) => {
    const handler = (_e: any, event: any) => callback(event);
    ipcRenderer.on('recording:event-captured', handler);
    return () => ipcRenderer.removeListener('recording:event-captured', handler);
  },

  onPlaybackProgress: (callback) => {
    const handler = (_e: any, progress: any) => callback(progress);
    ipcRenderer.on('playback:progress', handler);
    return () => ipcRenderer.removeListener('playback:progress', handler);
  },

  // 文件操作
  saveMacro: (macro) => ipcRenderer.invoke('file:save', macro),
  loadMacro: () => ipcRenderer.invoke('file:load'),
  listMacros: () => ipcRenderer.invoke('file:list'),
  deleteMacro: (id: string) => ipcRenderer.invoke('file:delete', id),

  // 系统
  getScreenSize: () => ipcRenderer.invoke('system:screenSize'),

  // 快捷键监听
  onShortcutToggleRecord: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('shortcut:toggle-record', handler);
    return () => ipcRenderer.removeListener('shortcut:toggle-record', handler);
  },
  onShortcutTogglePlayback: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('shortcut:toggle-playback', handler);
    return () => ipcRenderer.removeListener('shortcut:toggle-playback', handler);
  },
  // 主进程停止录制（快捷键触发，含冷却保护）
  onRecordingStopped: (callback) => {
    const handler = (_e: any, data: { events: any[] }) => callback(data);
    ipcRenderer.on('shortcut:recording-stopped', handler);
    return () => ipcRenderer.removeListener('shortcut:recording-stopped', handler);
  },
  // 主进程请求开始新录制（需要前端确认）
  onRequestStartRecord: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('shortcut:request-start-record', handler);
    return () => ipcRenderer.removeListener('shortcut:request-start-record', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
