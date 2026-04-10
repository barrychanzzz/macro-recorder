/// <reference types="vite/client" />

interface ElectronAPI {
  startRecording: () => Promise<{ success: boolean }>;
  stopRecording: () => Promise<{ success: boolean; events: any[] }>;
  setSensitivity: (config: { keyDebounceMs?: number; mouseClickDebounceMs?: number; mouseMoveThrottleMs?: number }) => Promise<{ success: boolean }>;
  startPlayback: (events: any[], settings: any) => Promise<{ success: boolean; error?: string }>;
  stopPlayback: () => Promise<{ success: boolean }>;
  onRecordingEvent: (callback: (event: any) => void) => () => void;
  onPlaybackProgress: (callback: (progress: any) => void) => () => void;
  saveMacro: (macro: any) => Promise<{ success: boolean; filePath?: string }>;
  loadMacro: () => Promise<{ success: boolean; macro?: any; error?: string }>;
  listMacros: () => Promise<any[]>;
  deleteMacro: (id: string) => Promise<{ success: boolean }>;
  getScreenSize: () => Promise<{ width: number; height: number }>;
  onShortcutToggleRecord: (callback: () => void) => () => void;
  onShortcutTogglePlayback: (callback: () => void) => () => void;
  onRecordingStopped: (callback: (data: { events: any[] }) => void) => () => void;
  onRequestStartRecord: (callback: () => void) => () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
