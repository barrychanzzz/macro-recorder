import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // Recording
  startRecording: () => Promise<{ success: boolean }>;
  stopRecording: () => Promise<{ success: boolean; events: any[] }>;
  setSensitivity: (config: { keyDebounceMs?: number; mouseClickDebounceMs?: number; mouseMoveThrottleMs?: number }) => Promise<{ success: boolean }>;

  // Playback
  startPlayback: (events: any[], settings: any) => Promise<{ success: boolean; error?: string }>;
  stopPlayback: () => Promise<{ success: boolean }>;

  // Event listeners (return cleanup functions)
  onRecordingEvent: (callback: (event: any) => void) => () => void;
  onPlaybackProgress: (callback: (progress: any) => void) => () => void;

  // File operations
  saveMacro: (macro: any) => Promise<{ success: boolean; filePath?: string }>;
  loadMacro: () => Promise<{ success: boolean; macro?: any; error?: string }>;
  listMacros: () => Promise<any[]>;
  deleteMacro: (id: string) => Promise<{ success: boolean }>;

  // System
  getScreenSize: () => Promise<{ width: number; height: number }>;

  // Shortcut events (forwarded from main process globalShortcut)
  onShortcutTogglePlayback: (callback: () => void) => () => void;
  // Main process stopped recording, now in cooldown
  onRecordingStopped: (callback: (data: { events: any[] }) => void) => () => void;
  // Main process requests starting new recording (needs frontend confirmation)
  onRequestStartRecord: (callback: () => void) => () => void;
}

const electronAPI: ElectronAPI = {
  // Recording control
  startRecording: () => ipcRenderer.invoke('recording:start'),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  setSensitivity: (config) => ipcRenderer.invoke('recording:setSensitivity', config),

  // Playback control
  startPlayback: (events, settings) => ipcRenderer.invoke('playback:start', { events, settings }),
  stopPlayback: () => ipcRenderer.invoke('playback:stop'),

  // Event listeners (return cleanup for useEffect unmount)
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

  // File operations
  saveMacro: (macro) => ipcRenderer.invoke('file:save', macro),
  loadMacro: () => ipcRenderer.invoke('file:load'),
  listMacros: () => ipcRenderer.invoke('file:list'),
  deleteMacro: (id: string) => ipcRenderer.invoke('file:delete', id),

  // System
  getScreenSize: () => ipcRenderer.invoke('system:screenSize'),

  // Shortcut listeners
  onShortcutTogglePlayback: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('shortcut:toggle-playback', handler);
    return () => ipcRenderer.removeListener('shortcut:toggle-playback', handler);
  },
  // Main process stopped recording (shortcut triggered, with cooldown protection)
  onRecordingStopped: (callback) => {
    const handler = (_e: any, data: { events: any[] }) => callback(data);
    ipcRenderer.on('shortcut:recording-stopped', handler);
    return () => ipcRenderer.removeListener('shortcut:recording-stopped', handler);
  },
  // Main process requests starting new recording (needs frontend confirmation)
  onRequestStartRecord: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('shortcut:request-start-record', handler);
    return () => ipcRenderer.removeListener('shortcut:request-start-record', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
