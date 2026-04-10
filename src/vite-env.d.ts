/// <reference types="vite/client" />

import { RecordedEvent, MacroSettings } from './types';

interface ElectronAPI {
  startRecording: () => Promise<{ success: boolean }>;
  stopRecording: () => Promise<{ success: boolean; events: RecordedEvent[] }>;
  setSensitivity: (config: { keyDebounceMs?: number; mouseClickDebounceMs?: number; mouseMoveThrottleMs?: number }) => Promise<{ success: boolean }>;
  startPlayback: (events: RecordedEvent[], settings: MacroSettings & { playbackSpeed: number; loopCount: number; loopDelay: number }) => Promise<{ success: boolean; error?: string }>;
  stopPlayback: () => Promise<{ success: boolean }>;
  onRecordingEvent: (callback: (event: RecordedEvent) => void) => () => void;
  onPlaybackProgress: (callback: (progress: { current: number; total: number; percentage: number; loop: number; totalLoops: number }) => void) => () => void;
  saveMacro: (macro: { id: string; name: string; description?: string; createdAt: number; updatedAt: number; events: RecordedEvent[]; settings: MacroSettings }) => Promise<{ success: boolean; filePath?: string }>;
  loadMacro: () => Promise<{ success: boolean; macro?: { id: string; name: string; description?: string; createdAt: number; updatedAt: number; events: RecordedEvent[]; settings: MacroSettings }; error?: string }>;
  listMacros: () => Promise<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number; events: RecordedEvent[]; settings: MacroSettings }[]>;
  deleteMacro: (id: string) => Promise<{ success: boolean }>;
  getScreenSize: () => Promise<{ width: number; height: number }>;
  onShortcutTogglePlayback: (callback: () => void) => () => void;
  onRecordingStopped: (callback: (data: { events: RecordedEvent[] }) => void) => () => void;
  onRequestStartRecord: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
