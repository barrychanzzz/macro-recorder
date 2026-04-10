import { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// ========== 背景录制：uiohook-napi 全局输入捕获 ==========
import { uIOhook, UiohookKey, UiohookKeyboardEvent, UiohookMouseEvent, UiohookWheelEvent } from 'uiohook-napi';

// ========== 快速回放：robotjs 即时输入模拟 ==========
import * as robot from 'robotjs';

// ========== 全局快捷键 ==========
// (globalShortcut 已在上面导入)

// robotjs 速度设置：0ms 延迟（最快速）
robot.setKeyboardDelay(0);
robot.setMouseDelay(0);

// ========== UiohookKey 反向映射：数字编码 → 按键名称 ==========
// UiohookKey 是 {Backspace: 14, Tab: 15, ...}，需要反向查表
const uiohookKeyName: Record<number, string> = {};
for (const [name, code] of Object.entries(UiohookKey)) {
  if (typeof code === 'number') {
    uiohookKeyName[code] = name;
  }
}

// ========== 浏览器 KeyboardEvent.code → robotjs 按键名映射（已废弃，保留兼容）==========
function browserCodeToRobot(code: string): string | null {
  // 字母键：A -> a
  if (/^Key([A-Z])$/.test(code)) {
    return RegExp.$1.toLowerCase();
  }
  // 数字键：Digit1 -> 1
  if (/^Digit([0-9])$/.test(code)) return RegExp.$1;
  // 小键盘：Numpad1 -> num_1
  if (/^Numpad([0-9])$/.test(code)) return `num_${RegExp.$1}`;
  // 功能键：F1 -> f1
  if (/^F([0-9]+)$/.test(code)) return `f${RegExp.$1}`;
  // 方向键
  const arrowMap: Record<string, string> = {
    ArrowUp: 'up', ArrowDown: 'down',
    ArrowLeft: 'left', ArrowRight: 'right',
  };
  if (arrowMap[code]) return arrowMap[code];
  // 其他修饰键
  const modMap: Record<string, string> = {
    ShiftLeft: 'shift', ShiftRight: 'shift',
    ControlLeft: 'control', ControlRight: 'control',
    AltLeft: 'alt', AltRight: 'alt',
    MetaLeft: 'command', MetaRight: 'command',
  };
  if (modMap[code]) return modMap[code];
  // 其他键名（直接匹配）
  const keyMap: Record<string, string> = {
    Space: 'space', Enter: 'enter', Tab: 'tab',
    Escape: 'escape', Backspace: 'backspace', Delete: 'delete',
    CapsLock: 'caps lock',
    Insert: 'insert', Home: 'home', End: 'end',
    PageUp: 'page up', PageDown: 'page down',
    Minus: '-', Equal: '=', Backquote: '`',
    BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'",
    Backslash: '\\', Comma: ',', Period: '.', Slash: '/',
  };
  return keyMap[code] ?? null;
}

// ========== 录制相关 ==========
let isRecording = false;
let recordedEvents: any[] = [];
let lastEventTime = 0;
let recordStartTime = 0;
let mainWindowRef: BrowserWindow | null = null;

// ========== 按键状态追踪：支持多键同时按住 + 区分短按/长按 ==========
// 架构说明：
// - 每个按键独立追踪：记录首次按下时间、是否已发出 keydown 事件
// - keydown 时：如果该键未在追踪中 → 记录并发出 keydown 事件
// - keyup 时：计算持续时间 → 短按(标记tap)或长按(标记holdDuration)
// - OS 键盘重复输入（同一键连续 keydown）通过 REPEAT_FILTER_MS 过滤

const HOLD_THRESHOLD_MS = 200;       // 长按阈值：按下超过此时间视为长按(ms)
const KEY_REPEAT_FILTER_MS = 40;     // OS 重复输入过滤间隔（macOS ~33ms）

interface KeyPressState {
  firstDownTime: number;   // 首次按下时刻（用于计算持续时间）
  lastDownTime: number;    // 最近一次按下时刻（用于过滤重复输入）
  keydownEmitted: boolean; // 是否已发出 keydown 事件
  keyName: string;         // 按键名称（从 uiohookKeyName 获取）
}
const activeKeys = new Map<number, KeyPressState>(); // keycode → 按键状态

// ========== 鼠标事件去重 & 灵敏度控制 ==========
// 触控板快速连续点击、或意外抖动都会产生大量鼠标事件
// 通过以下参数调优：
let mouseClickDebounceMs = 20;   // 同一按钮两次点击的最小间隔（< 此值视为误触/重复）
let mouseMoveThrottleMs = 16;    // 鼠标移动事件节流间隔（~60fps采样率）
let keyDebounceMs = 0;           // 按键去重间隔(ms)，默认0=不过滤（由 KeyPressState 机制管理）
let lastMouseDownTime = new Map<number, number>(); // button → 最后 mousedown 时间
let lastMouseMoveTime = 0;

// ========== 鼠标按钮编号标准化 ==========
// uiohook-napi 在 macOS 上使用 1-based 编号：
//   1 = 左键 (Left), 2 = 中键 (Middle), 3 = 右键 (Right)
// 在录制时立即转换为标准化的 button 名称字符串，
// 这样回放和显示层不需要再关心编号体系差异。
function normalizeMouseButton(rawButton: unknown): string {
  const btn = Number(rawButton);
  // 兼容两种编码方式：uiohook 的 1-based 和浏览器风格的 0-based
  const map: Record<number, string> = { 1: 'left', 0: 'left', 2: 'middle', 3: 'right' };
  return map[btn] || 'left';
}

function shouldRecordMouseDown(button: number): boolean {
  const now = Date.now();
  const lastDown = lastMouseDownTime.get(button);
  if (lastDown !== undefined && (now - lastDown) < mouseClickDebounceMs) {
    return false; // 距离上次太近，跳过
  }
  lastMouseDownTime.set(button, now);
  return true;
}

function shouldRecordMouseMove(): boolean {
  const now = Date.now();
  if ((now - lastMouseMoveTime) < mouseMoveThrottleMs) return false;
  lastMouseMoveTime = now;
  return true;
}

function clearMouseState() {
  lastMouseDownTime.clear();
  lastMouseMoveTime = 0;
}

/** 清理所有按键状态（停止录制时调用） */
function clearKeyState() {
  activeKeys.clear();
}

// uiohook 事件转发到渲染进程
function forwardUiohookEvent(type: string, data: any) {
  if (!isRecording || !mainWindowRef) return;
  const now = Date.now();
  const delay = lastEventTime ? now - lastEventTime : 0;
  lastEventTime = now;
  const event = {
    type,
    timestamp: now,
    delay,  // 与上一事件的间隔（ms）
    id: `${now}-${Math.random().toString(36).substr(2, 6)}`,
    data,
  };
  recordedEvents.push(event);
  mainWindowRef.webContents.send('recording:event-captured', event);
}

// 启动全局输入捕获（应用即使在后台也能捕获）
function startGlobalCapture() {
  uIOhook.on('keydown', (e: UiohookKeyboardEvent) => {
    const now = Date.now();
    const keycode = e.keycode;
    const keyName = uiohookKeyName[keycode] || String(keycode);

    // 检查该键是否已在追踪中
    const existing = activeKeys.get(keycode);

    if (existing) {
      // ★ 该键已按下 → 可能是 OS 重复输入
      // 更新 lastDownTime 但不再发出 keydown（避免重复）
      if ((now - existing.lastDownTime) < KEY_REPEAT_FILTER_MS) {
        return; // OS 重复输入，直接丢弃
      }
      existing.lastDownTime = now;
      return; // 不发出新事件
    }

    // ★ 首次按下 → 记录状态并发出 keydown 事件
    activeKeys.set(keycode, {
      firstDownTime: now,
      lastDownTime: now,
      keydownEmitted: true,
      keyName: keyName,
    });

    console.log('[Record][DEBUG] keydown:', { keyName, keycode, activeKeys: [...activeKeys.keys()] });

    forwardUiohookEvent('keydown', {
      key: keyName,
      code: keycode,
      altKey: e.altKey, ctrlKey: e.ctrlKey,
      metaKey: e.metaKey, shiftKey: e.shiftKey,
      isHold: false,   // keydown 时不知道是长按还是短按
      holdDuration: 0, // 持续时间在 keyup 时填充
    });
  });

  uIOhook.on('keyup', (e: UiohookKeyboardEvent) => {
    const now = Date.now();
    const keycode = e.keycode;
    const keyName = uiohookKeyName[keycode] || String(keycode);
    const state = activeKeys.get(keycode);

    if (!state) {
      // 没有对应 keydown 的 keyup → 忽略（可能是录制中途开始）
      return;
    }

    const duration = now - state.firstDownTime; // 按键持续时间(ms)
    const isHold = duration >= HOLD_THRESHOLD_MS;

    console.log('[Record][DEBUG] keyup:', { keyName, keycode, duration, isHold, activeKeys: [...activeKeys.keys()] });

    // 发出 keyup 事件（携带持续时间信息）
    forwardUiohookEvent('keyup', {
      key: keyName,
      code: keycode,
      altKey: e.altKey, ctrlKey: e.ctrlKey,
      metaKey: e.metaKey, shiftKey: e.shiftKey,
      isHold: isHold,          // 是否为长按
      holdDuration: duration,  // 实际持续时长(ms)
    });

    // 清理该按键状态
    activeKeys.delete(keycode);
  });

  uIOhook.on('mousedown', (e: UiohookMouseEvent) => {
    const rawBtn = Number(e.button);
    console.log('[MacroRecorder][DEBUG] mousedown raw:', { button: rawBtn, x: e.x, y: e.y });
    const btnName = normalizeMouseButton(rawBtn); // ★ 立即标准化为名称字符串

    // 去重检查使用原始编号
    if (!shouldRecordMouseDown(rawBtn)) return;

    forwardUiohookEvent('mousedown', {
      x: e.x, y: e.y,
      button: btnName,  // ★ 存储标准化后的按钮名（'left'|'middle'|'right'）
      buttonCode: rawBtn, // 保留原始编码用于调试
    });
  });
  uIOhook.on('mouseup', (e: UiohookMouseEvent) => {
    const btnName = normalizeMouseButton(e.button);
    forwardUiohookEvent('mouseup', {
      x: e.x, y: e.y,
      button: btnName,  // ★ 标准化
      buttonCode: Number(e.button),
    });
  });
  uIOhook.on('mousemove', (e: UiohookMouseEvent) => {
    // 鼠标移动节流：减少海量 move 事件，只记录有意义的位移
    if (!shouldRecordMouseMove()) return;
    forwardUiohookEvent('mousemove', {
      x: e.x, y: e.y,
    });
  });
  uIOhook.on('wheel', (e: UiohookWheelEvent) => {
    forwardUiohookEvent('wheel', {
      x: e.x, y: e.y,
      deltaY: e.rotation,
      deltaX: 0,
    });
  });
  uIOhook.start();
  console.log('[MacroRecorder] uiohook global capture started');
}

function stopGlobalCapture() {
  try { uIOhook.stop(); } catch (_) {}
  clearKeyState();   // 清理按键追踪状态（支持多键同时按住）
  clearMouseState(); // 清理鼠标去重状态
  console.log('[MacroRecorder] uIOhook global capture stopped');
}

// ========== 回放相关 ==========
let isPlaying = false;
let stopPlaybackFlag = false;

// 回放时鼠标位置缓存：避免每次 mousedown 前都调用 moveMouse
let lastPlaybackX = -1;
let lastPlaybackY = -1;

// ★ 回放时按键状态追踪：确保 keydown/keyup 配对，防止按键"卡住"
const playbackKeyDownKeys = new Set<string>();

/** 仅在位置变化时移动光标（减少 robotjs 调用开销） */
function moveMouseIfNeeded(x: number, y: number): void {
  if (x !== lastPlaybackX || y !== lastPlaybackY) {
    robot.moveMouse(x, y);
    lastPlaybackX = x;
    lastPlaybackY = y;
  }
}

/**
 * 将 uiohook 按键名称转换为 robotjs 可识别的名称
 * uiohook 使用 PascalCase (如 "ShiftLeft", "A")，robotjs 使用小写+空格 (如 "shift", "a")
 */
function toRobotKeyName(raw: string): string {
  return raw.toLowerCase().replace(/_/g, ' ');
}

async function simulateEvent(ev: any): Promise<void> {
  const { type, data } = ev;

  switch (type) {
    case 'mousemove': {
      // 移动事件只更新缓存位置，不立即调用 robot（等下次点击/实际需要时再移）
      lastPlaybackX = data.x;
      lastPlaybackY = data.y;
      break;
    }
    case 'mousedown': {
      // 先确保光标到位，再用 mouseClick 完成按下+释放
      moveMouseIfNeeded(data.x, data.y);
      // ★ button 已经是标准化字符串（'left'|'middle'|'right'），直接使用
      const btn = (typeof data.button === 'string') ? data.button : 'left';
      robot.mouseClick(btn);
      break;
    }
    case 'mouseup': {
      // mouseClick 已包含 up，但某些应用依赖完整序列，补发一个 up
      const btn = (typeof data.button === 'string') ? data.button : 'left';
      try { robot.mouseToggle('up', btn); } catch (_) {}
      break;
    }
    case 'wheel': {
      const amount = Math.abs(Math.round(data.deltaY / 100));
      if (amount > 0) {
        robot.scrollMouse(0, data.deltaY > 0 ? amount : -amount);
      }
      break;
    }
    case 'keydown': {
      // ★ 核心改动：使用 keyToggle('down') 而非 keyTap
      // 这样多个按键可以同时按住（如游戏中的 W+A 同时移动）
      // 对应的 keyup 会用 keyToggle('up') 来释放

      let keyName: string;
      if (typeof data.key === 'string') {
        keyName = toRobotKeyName(data.key);
      } else {
        const code = data.code as number;
        const rawKey = uiohookKeyName[code];
        keyName = rawKey ? toRobotKeyName(rawKey) : String(code);
      }

      console.log('[Playback][DEBUG] keydown:', { keyName, rawKey: data.key, code: data.code });

      // 构建修饰键列表
      const modifiers: string[] = [];
      if (data.metaKey) modifiers.push('command');
      if (data.ctrlKey) modifiers.push('control');
      if (data.altKey) modifiers.push('alt');
      if (data.shiftKey) modifiers.push('shift');

      try {
        // ★ 按下主键（支持多键同时按住）
        robot.keyToggle(keyName, 'down');
        playbackKeyDownKeys.add(keyName); // ★ 追踪已按下状态
        // 如果有修饰键，也一起按下（组合键场景）
        for (const mod of modifiers) {
          robot.keyToggle(mod, 'down');
          playbackKeyDownKeys.add(mod);
        }

        console.log('[Playback][DEBUG] keydown done, activeKeys now:', [...playbackKeyDownKeys]);
      } catch (err) {
        console.error('[Playback] keydown error:', err);
      }
      break;
    }
    case 'keyup': {
      // ★ 核心改动：释放按键 + 模拟长按持续时间
      // 当 isHold=true 时，表示原始操作是长按。
      // 但由于回放引擎是事件驱动的（keyEventN 的 keydown → ... → keyEventM 的 keyup），
      // 按键实际上已经自然"按住"了正确的持续时间（从 keydown 到 keyup 之间的时间差）。
      // 所以这里只需要确保正确释放即可。

      let keyName: string;
      if (typeof data.key === 'string') {
        keyName = toRobotKeyName(data.key);
      } else {
        const code = data.code as number;
        const rawKey = uiohookKeyName[code];
        keyName = rawKey ? toRobotKeyName(rawKey) : String(code);
      }

      const isHold = !!data.isHold;
      const holdDuration = data.holdDuration || 0;

      console.log('[Playback][DEBUG] keyup:', { keyName, isHold, holdDuration });

      const modifiers: string[] = [];
      if (data.metaKey) modifiers.push('command');
      if (data.ctrlKey) modifiers.push('control');
      if (data.altKey) modifiers.push('alt');
      if (data.shiftKey) modifiers.push('shift');

      try {
        // ★ 先释放修饰键（后进先出）
        for (const mod of [...modifiers].reverse()) {
          robot.keyToggle(mod, 'up');
          playbackKeyDownKeys.delete(mod);
        }
        // ★ 释放主键
        robot.keyToggle(keyName, 'up');
        playbackKeyDownKeys.delete(keyName);

        console.log('[Playback][DEBUG] keyup done, activeKeys now:', [...playbackKeyDownKeys]);
      } catch (err) {
        console.error('[Playback] keyup error:', err);
      }
      break;
    }
  }
}

// ========== IPC 处理 ==========
ipcMain.handle('recording:start', () => {
  isRecording = true;
  recordedEvents = [];
  lastEventTime = 0;
  recordStartTime = Date.now();
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

// 设置录制灵敏度参数（可在开始录制前或录制中动态调整）
ipcMain.handle('recording:setSensitivity', (_event, config: {
  keyDebounceMs?: number;
  mouseClickDebounceMs?: number;
  mouseMoveThrottleMs?: number;
}) => {
  if (config.keyDebounceMs !== undefined) keyDebounceMs = config.keyDebounceMs;
  if (config.mouseClickDebounceMs !== undefined) mouseClickDebounceMs = config.mouseClickDebounceMs;
  if (config.mouseMoveThrottleMs !== undefined) mouseMoveThrottleMs = config.mouseMoveThrottleMs;
  console.log('[MacroRecorder] Sensitivity updated:', config);
  return { success: true };
});

// 渲染进程发送的事件（用于补充或调试）
ipcMain.on('recording:event', (event, eventData) => {
  if (!isRecording) return;
  forwardUiohookEvent(eventData.type, eventData.data);
});

ipcMain.handle('playback:start', async (event, { events, settings }: { events: any[]; settings?: any }) => {
  if (isPlaying) return { success: false, error: 'Already playing' };

  isPlaying = true;
  stopPlaybackFlag = false;

  // ★ 重置鼠标位置缓存
  lastPlaybackX = -1;
  lastPlaybackY = -1;

  const speed: number = settings?.playbackSpeed ?? 1;
  const loopCount: number = settings?.loopCount ?? 1;
  const loopDelay: number = settings?.loopDelay ?? 1000;
  const totalLoops = loopCount === 0 ? Infinity : loopCount;

  // ★ 绝对时间戳回放引擎：
  // 不再用"事件间相对 delay + 累积等待"的方式（有漂移问题）
  // 改为：记录回放起始时间 T0，每个事件应该在 T0 + (timestamp - firstTimestamp) / speed 时执行
  // 用 performance.now() 获取高精度时间（亚毫秒级）
  if (events.length === 0) {
    isPlaying = false;
    return { success: false, error: 'No events to play' };
  }

  const firstTimestamp = events[0].timestamp;
  // 预计算所有事件的调度时间（相对于回放开始时刻的偏移量）
  const scheduleOffsets: number[] = events.map(ev => (ev.timestamp - firstTimestamp) / speed);

  try {
    for (let loop = 0; loop < totalLoops && !stopPlaybackFlag; loop++) {
      // ★ 每次循环重新建立时间基准
      const loopStartTime = performance.now();

      // ★ 安全清理：每次循环开始前确保没有残留的按下状态
      if (playbackKeyDownKeys.size > 0) {
        console.log('[Playback][WARN] Cleaning up', playbackKeyDownKeys.size, 'stale keys from previous iteration:', [...playbackKeyDownKeys]);
        for (const stuckKey of [...playbackKeyDownKeys]) {
          try { robot.keyToggle(stuckKey, 'up'); } catch (_) {}
        }
        playbackKeyDownKeys.clear();
      }

      console.log('[Playback] Starting loop', loop + 1, '/', totalLoops === Infinity ? '∞' : totalLoops,
        '| events:', events.length, '| speed:', speed);

      for (let i = 0; i < events.length && !stopPlaybackFlag; i++) {
        const ev = events[i];
        const targetOffset = scheduleOffsets[i];

        // ★ 精确等待：用 performance.now() 计算还需等待的时间
        while (performance.now() - loopStartTime < targetOffset && !stopPlaybackFlag) {
          await new Promise(r => setTimeout(r, 1)); // 1ms 粒度轮询
        }

        if (stopPlaybackFlag) break;

        // ★ 调试日志（每10个事件输出一次进度）
        if (i % 10 === 0 || i === events.length - 1) {
          console.log('[Playback] Event', i + 1, '/', events.length, '| type:', ev.type,
            '| key:', ev.data?.key, '| isHold:', ev.data?.isHold);
        }

        try {
          await simulateEvent(ev);
        } catch (err) {
          console.error('[Playback] Error at event', i, ':', ev.type, err);
        }

        event.sender.send('playback:progress', {
          current: i + 1,
          total: events.length,
          percentage: Math.round(((i + 1) / events.length) * 100),
          loop: loop + 1,
          totalLoops: loopCount === 0 ? -1 : loopCount,
        });
      }

      if (!stopPlaybackFlag && loop < totalLoops - 1 && loopDelay > 0) {
        console.log('[Playback] Loop delay:', loopDelay, 'ms before next iteration');
        await new Promise(r => setTimeout(r, loopDelay));
      }
    }
  } finally {
    // ★ 最终安全清理：确保所有按键都被释放（防止回放中断导致按键"卡住"）
    if (playbackKeyDownKeys.size > 0) {
      console.log('[Playback][FINALLY] Cleaning up', playbackKeyDownKeys.size, 'remaining keys:', [...playbackKeyDownKeys]);
      for (const stuckKey of [...playbackKeyDownKeys]) {
        try { robot.keyToggle(stuckKey, 'up'); } catch (_) {}
      }
      playbackKeyDownKeys.clear();
    }
    isPlaying = false;
    stopPlaybackFlag = false;
    console.log('[Playback] Finished');
  }

  return { success: true };
});

ipcMain.handle('playback:stop', () => {
  stopPlaybackFlag = true;
  isPlaying = false;
  return { success: true };
});

// ========== 文件操作 IPC ==========
const getMacrosDir = () => {
  const userDataPath = app.getPath('userData');
  const macrosDir = path.join(userDataPath, 'macros');
  if (!fs.existsSync(macrosDir)) {
    fs.mkdirSync(macrosDir, { recursive: true });
  }
  return macrosDir;
};

ipcMain.handle('file:save', async (_event, macro) => {
  const { filePath } = await dialog.showSaveDialog(mainWindowRef!, {
    title: '保存宏',
    defaultPath: `${macro.name}.json`,
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (filePath) {
    fs.writeFileSync(filePath, JSON.stringify(macro, null, 2), 'utf-8');
    return { success: true, filePath };
  }
  return { success: false };
});

ipcMain.handle('file:load', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindowRef!, {
    title: '加载宏',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (filePaths && filePaths.length > 0) {
    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8');
      return { success: true, macro: JSON.parse(content) };
    } catch {
      return { success: false, error: 'Failed to parse file' };
    }
  }
  return { success: false };
});

ipcMain.handle('file:list', () => {
  const macrosDir = getMacrosDir();
  const files = fs.readdirSync(macrosDir).filter(f => f.endsWith('.json'));
  return files.map(file => {
    const content = fs.readFileSync(path.join(macrosDir, file), 'utf-8');
    return JSON.parse(content);
  });
});

ipcMain.handle('file:delete', (_event, macroId) => {
  const filePath = path.join(getMacrosDir(), `${macroId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('storage:save', (_event, macro) => {
  const filePath = path.join(getMacrosDir(), `${macro.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(macro, null, 2), 'utf-8');
  return { success: true };
});

ipcMain.handle('system:screenSize', () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return { width, height };
});

// ========== Electron 窗口 ==========
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindowRef = new BrowserWindow({
    width: Math.min(1200, Math.floor(width * 0.8)),
    height: Math.min(800, Math.floor(height * 0.8)),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'MacroRecorder',
    show: false,
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindowRef.loadURL('http://localhost:5173');
    mainWindowRef.webContents.openDevTools();
  } else {
    mainWindowRef.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindowRef.once('ready-to-show', () => {
    mainWindowRef?.show();
  });
}

// ========== 全局快捷键 ==========
// 在主进程层面做冷却控制，避免渲染进程弹窗被绕过
let recordShortcutCooldown = false;
const SHORTCUT_COOLDOWN_MS = 1000; // 快捷键冷却时间

function registerGlobalShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    // 主进程层面冷却检查
    if (recordShortcutCooldown) return;

    if (isRecording) {
      // 正在录制 → 停止
      recordShortcutCooldown = true;
      isRecording = false;
      stopGlobalCapture();
      const events = [...recordedEvents];
      recordedEvents = [];
      mainWindowRef?.webContents.send('shortcut:recording-stopped', { events });
      // 冷却期内忽略快捷键
      setTimeout(() => { recordShortcutCooldown = false; }, SHORTCUT_COOLDOWN_MS);
    } else {
      // 未录制 → 通知渲染进程确认后再开始
      // 渲染进程会通过 IPC 调用 recording:start
      mainWindowRef?.webContents.send('shortcut:request-start-record');
    }
  });

  globalShortcut.register('CommandOrControl+Shift+P', () => {
    mainWindowRef?.webContents.send('shortcut:toggle-playback');
  });
}

// ========== 应用生命周期 ==========
app.whenReady().then(() => {
  createWindow();
  registerGlobalShortcuts();
});

app.on('window-all-closed', () => {
  stopGlobalCapture();
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  stopGlobalCapture();
  globalShortcut.unregisterAll();
});
