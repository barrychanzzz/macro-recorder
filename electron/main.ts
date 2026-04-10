import { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

import { uIOhook, UiohookKey, UiohookKeyboardEvent, UiohookMouseEvent, UiohookWheelEvent } from 'uiohook-napi';
import * as robot from 'robotjs';

// ── 全局配置 ──────────────────────────────────────────────

/** 开发模式调试日志（发布时设为 false） */
const DEBUG = process.env.NODE_ENV === 'development' || !app.isPackaged;

const log = {
  debug: (...args: unknown[]) => { if (DEBUG) console.debug('[MR]', ...args); },
  info: (...args: unknown[]) => { if (DEBUG) console.info('[MR]', ...args); },
  warn: (...args: unknown[]) => console.warn('[MR]', ...args),
  error: (...args: unknown[]) => console.error('[MR]', ...args),
};

robot.setKeyboardDelay(0);
robot.setMouseDelay(0);

// ── 类型定义（主进程内部使用） ───────────

/**
 * 录制事件的数据部分。
 * 使用 Record 保持灵活性——事件来自 uiohook 捕获 + JSON 序列化，
 * 过度严格的联合体类型在实际访问时反而增加不必要的类型守卫开销。
 */
type EventData = Record<string, unknown> & {
  key?: string;
  code?: number;
  altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean;
  isHold?: boolean;
  holdDuration?: number;
  x?: number; y?: number;
  button?: string;
  buttonCode?: number;
  deltaX?: number; deltaY?: number;
};

interface RecordedEventInternal {
  type: string;
  timestamp: number;
  delay: number;
  id: string;
  data: EventData;
}

interface PlaybackSettings {
  playbackSpeed?: number;
  loopCount?: number;
  loopDelay?: number;
}

// ── uiohook 反向映射 ─────────────────────────────────────

const uiohookKeyName: Record<number, string> = {};
for (const [name, code] of Object.entries(UiohookKey)) {
  if (typeof code === 'number') uiohookKeyName[code] = name;
}

/** PascalCase → robotjs 小写+空格 */
function toRobotName(raw: string): string {
  return raw.toLowerCase().replace(/_/g, ' ');
}

/** 从事件数据解析按键名（统一 keydown/keyup 的重复逻辑） */
function resolveKeyName(data: EventData): string {
  if (typeof data.key === 'string') return toRobotName(data.key);
  const code = Number(data.code);
  const raw = uiohookKeyName[code];
  return raw ? toRobotName(raw) : String(code);
}

/** 构建修饰键列表（统一 keydown/keyup 的重复逻辑） */
function buildModifiers(data: EventData): string[] {
  const mods: string[] = [];
  if (data.metaKey) mods.push('command');
  if (data.ctrlKey) mods.push('control');
  if (data.altKey) mods.push('alt');
  if (data.shiftKey) mods.push('shift');
  return mods;
}

// ── 录制状态 ──────────────────────────────────────────────

let isRecording = false;
let recordedEvents: RecordedEventInternal[] = [];
let lastEventTime = 0;
let mainWindowRef: BrowserWindow | null = null;

const HOLD_THRESHOLD_MS = 200;
const KEY_REPEAT_FILTER_MS = 40;

interface KeyPressState {
  firstDownTime: number;
  lastDownTime: number;
  keydownEmitted: boolean;
  keyName: string;
}
const activeKeys = new Map<number, KeyPressState>();

let mouseClickDebounceMs = 20;
let mouseMoveThrottleMs = 16;
let _keyDebounceMs = 0;
const lastMouseDownTime = new Map<number, number>();
let lastMouseMoveTime = 0;

// ── 鼠标工具函数 ──────────────────────────────────────────

const MOUSE_BUTTON_MAP: Record<number, string> = { 1: 'left', 0: 'left', 2: 'middle', 3: 'right' };
function normalizeMouseButton(raw: unknown): string { return MOUSE_BUTTON_MAP[Number(raw)] || 'left'; }

function shouldRecordMouseDown(button: number): boolean {
  const now = Date.now();
  const last = lastMouseDownTime.get(button);
  if (last !== undefined && now - last < mouseClickDebounceMs) return false;
  lastMouseDownTime.set(button, now);
  return true;
}

function shouldRecordMouseMove(): boolean {
  const now = Date.now();
  if (now - lastMouseMoveTime < mouseMoveThrottleMs) return false;
  lastMouseMoveTime = now;
  return true;
}

function clearMouseState() { lastMouseDownTime.clear(); lastMouseMoveTime = 0; }
function clearKeyState() { activeKeys.clear(); }

// ── 事件转发 ──────────────────────────────────────────────

function forwardUiohookEvent(type: string, data: EventData) {
  if (!isRecording || !mainWindowRef) return;
  const now = Date.now();
  const delay = lastEventTime ? now - lastEventTime : 0;
  lastEventTime = now;
  const ev: RecordedEventInternal = { type, timestamp: now, delay, id: `${now}-${Math.random().toString(36).slice(2, 8)}`, data };
  recordedEvents.push(ev);
  mainWindowRef.webContents.send('recording:event-captured', ev);
}

// ── 全局输入捕获 ──────────────────────────────────────────

function startGlobalCapture() {
  uIOhook.on('keydown', (e: UiohookKeyboardEvent) => {
    const now = Date.now();
    const { keycode } = e;
    const keyName = uiohookKeyName[keycode] || String(keycode);

    const existing = activeKeys.get(keycode);
    if (existing) {
      if (now - existing.lastDownTime < KEY_REPEAT_FILTER_MS) return;
      existing.lastDownTime = now;
      return;
    }

    activeKeys.set(keycode, { firstDownTime: now, lastDownTime: now, keydownEmitted: true, keyName });

    log.debug('keydown:', { keyName, keycode, tracking: activeKeys.size });
    forwardUiohookEvent('keydown', { key: keyName, code: keycode, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, isHold: false, holdDuration: 0 });
  });

  uIOhook.on('keyup', (e: UiohookKeyboardEvent) => {
    const now = Date.now();
    const { keycode } = e;
    const keyName = uiohookKeyName[keycode] || String(keycode);
    const state = activeKeys.get(keycode);
    if (!state) return;

    const duration = now - state.firstDownTime;
    const isHold = duration >= HOLD_THRESHOLD_MS;

    log.debug('keyup:', { keyName, keycode, duration, isHold });
    forwardUiohookEvent('keyup', { key: keyName, code: keycode, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, isHold, holdDuration: duration });
    activeKeys.delete(keycode);
  });

  uIOhook.on('mousedown', (e: UiohookMouseEvent) => {
    const rawBtn = Number(e.button);
    log.debug('mousedown raw:', { button: rawBtn, x: e.x, y: e.y });
    if (!shouldRecordMouseDown(rawBtn)) return;
    forwardUiohookEvent('mousedown', { x: e.x, y: e.y, button: normalizeMouseButton(rawBtn), buttonCode: rawBtn });
  });

  uIOhook.on('mouseup', (e: UiohookMouseEvent) => {
    forwardUiohookEvent('mouseup', { x: e.x, y: e.y, button: normalizeMouseButton(e.button), buttonCode: Number(e.button) });
  });

  uIOhook.on('mousemove', (e: UiohookMouseEvent) => {
    if (!shouldRecordMouseMove()) return;
    forwardUiohookEvent('mousemove', { x: e.x, y: e.y });
  });

  uIOhook.on('wheel', (e: UiohookWheelEvent) => {
    forwardUiohookEvent('wheel', { x: e.x, y: e.y, deltaY: e.rotation, deltaX: 0 });
  });

  uIOhook.start();
  log.info('Global capture started');
}

function stopGlobalCapture() {
  try { uIOhook.stop(); } catch (_) {}
  clearKeyState();
  clearMouseState();
  log.info('Global capture stopped');
}

// ── 回放引擎 ──────────────────────────────────────────────

let isPlaying = false;
let stopPlaybackFlag = false;
let lastPlaybackX = -1;
let lastPlaybackY = -1;
const playbackKeyDownKeys = new Set<string>();

function moveMouseIfNeeded(x: number, y: number): void {
  if (x !== lastPlaybackX || y !== lastPlaybackY) {
    robot.moveMouse(x, y);
    lastPlaybackX = x; lastPlaybackY = y;
  }
}

/** 安全释放所有残留按键 */
function releaseAllStuckKeys() {
  if (playbackKeyDownKeys.size === 0) return;
  log.warn('Cleaning up stuck keys:', [...playbackKeyDownKeys]);
  for (const k of playbackKeyDownKeys) { try { robot.keyToggle(k, 'up'); } catch (_) {} }
  playbackKeyDownKeys.clear();
}

async function simulateEvent(ev: RecordedEventInternal): Promise<void> {
  const { type, data } = ev;

  switch (type) {
    case 'mousemove':
      lastPlaybackX = data.x || 0; lastPlaybackY = data.y || 0;
      break;

    case 'mousedown': {
      moveMouseIfNeeded(data.x || 0, data.y || 0);
      robot.mouseClick(String(data.button) || 'left');
      break;
    }

    case 'mouseup': {
      try { robot.mouseToggle('up', String(data.button) || 'left'); } catch (_) {}
      break;
    }

    case 'wheel': {
      const dY = Number(data.deltaY) || 0;
      const amount = Math.abs(Math.round(dY / 100));
      if (amount > 0) robot.scrollMouse(0, dY > 0 ? amount : -amount);
      break;
    }

    case 'keydown': {
      const keyName = resolveKeyName(data);
      const modifiers = buildModifiers(data);

      log.debug('play keydown:', { keyName, modifiers });
      try {
        robot.keyToggle(keyName, 'down');
        playbackKeyDownKeys.add(keyName);
        for (const mod of modifiers) { robot.keyToggle(mod, 'down'); playbackKeyDownKeys.add(mod); }
      } catch (err) { log.error('keydown error:', err); }
      break;
    }

    case 'keyup': {
      const keyName = resolveKeyName(data);
      const modifiers = buildModifiers(data);

      log.debug('play keyup:', { keyName, isHold: data.isHold, holdDuration: data.holdDuration });
      try {
        for (const mod of [...modifiers].reverse()) { robot.keyToggle(mod, 'up'); playbackKeyDownKeys.delete(mod); }
        robot.keyToggle(keyName, 'up');
        playbackKeyDownKeys.delete(keyName);
      } catch (err) { log.error('keyup error:', err); }
      break;
    }
  }
}

// ── IPC 处理 ────────────────────────────────────────────────

ipcMain.handle('recording:start', () => {
  isRecording = true;
  recordedEvents = [];
  lastEventTime = 0;
  startGlobalCapture();
  return { success: true };
});

ipcMain.handle('recording:stop', () => {
  isRecording = false;
  stopGlobalCapture();
  const events = [...recordedEvents];
  recordedEvents = [];
  return { success: true, events };
});

ipcMain.handle('recording:setSensitivity', (_event, config: { keyDebounceMs?: number; mouseClickDebounceMs?: number; mouseMoveThrottleMs?: number }) => {
  if (config.keyDebounceMs !== undefined) _keyDebounceMs = config.keyDebounceMs;
  if (config.mouseClickDebounceMs !== undefined) mouseClickDebounceMs = config.mouseClickDebounceMs;
  if (config.mouseMoveThrottleMs !== undefined) mouseMoveThrottleMs = config.mouseMoveThrottleMs;
  log.info('Sensitivity updated:', config);
  return { success: true };
});

ipcMain.on('recording:event', (_event, eventData: { type: string; data: EventData }) => {
  if (!isRecording) return;
  forwardUiohookEvent(eventData.type, eventData.data);
});

ipcMain.handle('playback:start', async (event, { events, settings }: { events: RecordedEventInternal[]; settings?: PlaybackSettings }) => {
  if (isPlaying) return { success: false, error: 'Already playing' };

  isPlaying = true;
  stopPlaybackFlag = false;
  lastPlaybackX = -1;
  lastPlaybackY = -1;

  const speed = settings?.playbackSpeed ?? 1;
  const loopCount = settings?.loopCount ?? 1;
  const loopDelay = settings?.loopDelay ?? 1000;
  const totalLoops = loopCount === 0 ? Infinity : loopCount;

  if (events.length === 0) { isPlaying = false; return { success: false, error: 'No events to play' }; }

  const firstTimestamp = events[0].timestamp;
  const scheduleOffsets = events.map(ev => (ev.timestamp - firstTimestamp) / speed);

  try {
    for (let loop = 0; loop < totalLoops && !stopPlaybackFlag; loop++) {
      const loopStartTime = performance.now();
      releaseAllStuckKeys();

      log.info(`Loop ${loop + 1}/${totalLoops === Infinity ? '∞' : totalLoops} | ${events.length} events | ${speed}x`);

      for (let i = 0; i < events.length && !stopPlaybackFlag; i++) {
        while (performance.now() - loopStartTime < scheduleOffsets[i] && !stopPlaybackFlag) {
          await new Promise(r => setTimeout(r, 1));
        }
        if (stopPlaybackFlag) break;

        try { await simulateEvent(events[i]); } catch (err) { log.error(`Event ${i} (${events[i].type}):`, err); }

        event.sender.send('playback:progress', {
          current: i + 1, total: events.length,
          percentage: Math.round(((i + 1) / events.length) * 100),
          loop: loop + 1, totalLoops: loopCount === 0 ? -1 : loopCount,
        });
      }

      if (!stopPlaybackFlag && loop < totalLoops - 1 && loopDelay > 0) {
        await new Promise(r => setTimeout(r, loopDelay));
      }
    }
  } finally {
    releaseAllStuckKeys();
    isPlaying = false;
    stopPlaybackFlag = false;
    log.info('Playback finished');
  }

  return { success: true };
});

ipcMain.handle('playback:stop', () => {
  stopPlaybackFlag = true;
  isPlaying = false;
  return { success: true };
});

// ── 文件操作 ────────────────────────────────────────────────

const getMacrosDir = (): string => {
  const dir = path.join(app.getPath('userData'), 'macros');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

ipcMain.handle('file:save', async (_event, macro: { name: string }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindowRef!, { title: '保存宏', defaultPath: `${macro.name}.json`, filters: [{ name: 'JSON Files', extensions: ['json'] }] });
  if (filePath) { fs.writeFileSync(filePath, JSON.stringify(macro, null, 2), 'utf-8'); return { success: true, filePath }; }
  return { success: false };
});

ipcMain.handle('file:load', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindowRef!, { title: '加载宏', filters: [{ name: 'JSON Files', extensions: ['json'] }], properties: ['openFile'] });
  if (filePaths?.length) { try { return { success: true, macro: JSON.parse(fs.readFileSync(filePaths[0], 'utf-8')) }; } catch { return { success: false, error: 'Failed to parse file' }; } }
  return { success: false };
});

ipcMain.handle('file:list', () => {
  const dir = getMacrosDir();
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
});

ipcMain.handle('file:delete', (_event, id: string) => {
  const fp = path.join(getMacrosDir(), `${id}.json`);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); return { success: true }; }
  return { success: false };
});

ipcMain.handle('storage:save', (_event, macro: { id: string }) => {
  fs.writeFileSync(path.join(getMacrosDir(), `${macro.id}.json`), JSON.stringify(macro, null, 2), 'utf-8');
  return { success: true };
});

ipcMain.handle('system:screenSize', () => screen.getPrimaryDisplay().workAreaSize);

// ── 窗口 & 快捷键 & 生命周期 ────────────────────────────

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindowRef = new BrowserWindow({
    width: Math.min(1200, Math.floor(width * 0.8)), height: Math.min(800, Math.floor(height * 0.8)),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    title: 'MacroRecorder', show: false,
  });
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindowRef.loadURL('http://localhost:5173');
    mainWindowRef.webContents.openDevTools();
  } else {
    mainWindowRef.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  mainWindowRef.once('ready-to-show', () => mainWindowRef?.show());
}

let recordShortcutCooldown = false;
const SHORTCUT_COOLDOWN_MS = 1000;

function registerGlobalShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (recordShortcutCooldown) return;
    if (isRecording) {
      recordShortcutCooldown = true; isRecording = false; stopGlobalCapture();
      mainWindowRef?.webContents.send('shortcut:recording-stopped', { events: [...recordedEvents] });
      recordedEvents = [];
      setTimeout(() => { recordShortcutCooldown = false; }, SHORTCUT_COOLDOWN_MS);
    } else {
      mainWindowRef?.webContents.send('shortcut:request-start-record');
    }
  });

  globalShortcut.register('CommandOrControl+Shift+P', () => {
    mainWindowRef?.webContents.send('shortcut:toggle-playback');
  });
}

app.whenReady().then(() => { createWindow(); registerGlobalShortcuts(); });
app.on('window-all-closed', () => { stopGlobalCapture(); globalShortcut.unregisterAll(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('will-quit', () => { stopGlobalCapture(); globalShortcut.unregisterAll(); });
