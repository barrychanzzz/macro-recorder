import { useState, useEffect, useCallback, useRef } from 'react';
import { RecordedEvent, Macro, MacroSettings } from './types';
import Header from './components/Header';
import ControlBar from './components/ControlBar';
import EventList from './components/EventList';
import SavedMacros from './components/SavedMacros';
import MacroSettingsPanel from './components/MacroSettingsPanel';
import './App.css';

const DEFAULT_SETTINGS: MacroSettings = {
  playbackSpeed: 1,
  loopCount: 1,
  loopDelay: 1000,
  mouseClickDebounceMs: 20,   // ★ 鼠标点击去重阈值(ms)，默认20ms（保留连点能力）
  mouseMoveThrottleMs: 16,    // ★ 鼠标移动节流(ms)，默认16ms(~60fps)
};

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [events, setEvents] = useState<RecordedEvent[]>([]);
  const [macroName, setMacroName] = useState('未命名宏');
  const [macroDescription, setMacroDescription] = useState('');
  const [settings, setSettings] = useState<MacroSettings>(DEFAULT_SETTINGS);
  const [playbackProgress, setPlaybackProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [savedMacros, setSavedMacros] = useState<Macro[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [editingEvent, setEditingEvent] = useState<RecordedEvent | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());

  // 用 ref 保持 events 的最新值，解决快捷键闭包捕获过期 state 的问题
  const eventsRef = useRef<RecordedEvent[]>([]);
  eventsRef.current = events;

  // 同样保持 settings 和 isRecording 的最新值
  const settingsRef = useRef<MacroSettings>(settings);
  settingsRef.current = settings;
  const isRecordingRef = useRef<boolean>(isRecording);
  isRecordingRef.current = isRecording;

  // 加载已保存的宏
  useEffect(() => {
    loadSavedMacros();
  }, []);

  // 监听来自主进程的事件（uiohook 全局捕获，通过 IPC 转发）
  useEffect(() => {
    if (!window.electronAPI) return;

    // uiohook 捕获到事件后，主进程会通过 IPC 发送过来
    const unsubEvent = window.electronAPI.onRecordingEvent((capturedEvent) => {
      setEvents(prev => [...prev, capturedEvent]);
    });

    // 回放进度更新
    const unsubProgress = window.electronAPI.onPlaybackProgress((progress) => {
      setPlaybackProgress(progress);
    });

    // ★ 主进程已通过快捷键停止录制（冷却保护在主进程中完成）
    const unsubRecordingStopped = window.electronAPI.onRecordingStopped(() => {
      setIsRecording(false);
    });

    // ★ 主进程请求开始新录制（需用户确认）
    const unsubRequestStart = window.electronAPI.onRequestStartRecord(() => {
      handleStartRecordingWithConfirm();
    });

    // 全局快捷键：Ctrl+Shift+P 切换回放（回放无循环问题，保持原逻辑）
    const unsubShortcutPlayback = window.electronAPI.onShortcutTogglePlayback(() => {
      handleTogglePlayback();
    });

    return () => {
      unsubEvent();
      unsubProgress();
      unsubRecordingStopped();
      unsubRequestStart();
      unsubShortcutPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSavedMacros = async () => {
    if (!window.electronAPI) return;
    try {
      const macros = await window.electronAPI.listMacros();
      setSavedMacros(macros);
    } catch (error) {
      console.error('Failed to load macros:', error);
    }
  };

  /** 带确认弹窗的开始录制逻辑（快捷键和按钮共用） */
  const handleStartRecordingWithConfirm = useCallback(async () => {
    if (!window.electronAPI) return;
    if (isRecordingRef.current) return; // 已在录制中，不响应（从 ref 读）

    // 始终从 ref 读取最新值
    const currentEvents = eventsRef.current;

    // 开始新录制前确认（如果有已有事件）
    if (currentEvents.length > 0) {
      if (!confirm('⚠️ 开始新录制将清空当前已录制的 ' + currentEvents.length + ' 个事件，是否继续？')) return;
    }
    setEvents([]); // 清空

    // ★ 将灵敏度设置同步到主进程
    const currentSettings = settingsRef.current;
    await window.electronAPI.setSensitivity({
      mouseClickDebounceMs: currentSettings.mouseClickDebounceMs ?? 60,
      mouseMoveThrottleMs: currentSettings.mouseMoveThrottleMs ?? 30,
    });

    await window.electronAPI.startRecording();
    setIsRecording(true);
  }, []); // 无依赖——所有动态值都通过 ref 读取

  /** UI 按钮点击 → 切换录制 */
  const handleToggleRecording = async () => {
    if (!window.electronAPI) return;

    if (isRecording) {
      // 按钮点击停止录制（不走快捷键路径）
      await window.electronAPI.stopRecording();
      setIsRecording(false);
    } else {
      // 按钮点击开始录制（带确认）
      await handleStartRecordingWithConfirm();
    }
  };

  const handleTogglePlayback = async () => {
    if (!window.electronAPI) return;

    // ★ 始终从 ref 读取最新值（避免闭包捕获过期 state）
    const currentEvents = eventsRef.current;
    const currentSettings = settingsRef.current;

    if (isPlaying) {
      await window.electronAPI.stopPlayback();
      setIsPlaying(false);
      setPlaybackProgress({ current: 0, total: 0, percentage: 0 });
    } else {
      if (currentEvents.length === 0) {
        alert('没有可回放的事件');
        return;
      }
      setIsPlaying(true);
      setPlaybackProgress({ current: 0, total: currentEvents.length, percentage: 0 });
      await window.electronAPI.startPlayback(currentEvents, currentSettings);
      setIsPlaying(false);
    }
  };

  const handleClearEvents = () => {
    if (events.length === 0) return;
    if (confirm('确定要清空所有事件吗？')) {
      setEvents([]);
    }
  };

  const handleDeleteEvent = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const handleEditEvent = (event: RecordedEvent) => {
    setEditingEvent(event);
  };

  const handleSaveEvent = (updatedEvent: RecordedEvent) => {
    setEvents(prev => prev.map(e => e.id === updatedEvent.id ? updatedEvent : e));
    setEditingEvent(null);
  };

  const handleSaveMacro = async () => {
    if (!window.electronAPI) return;

    const macro: Macro = {
      id: `macro-${Date.now()}`,
      name: macroName,
      description: macroDescription,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      events,
      settings,
    };

    try {
      await window.electronAPI.saveMacro(macro);
      await loadSavedMacros();
      alert('宏保存成功！');
    } catch (error) {
      console.error('Failed to save macro:', error);
      alert('保存失败');
    }
  };

  const handleLoadMacro = async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.loadMacro();
      if (result.success && result.macro) {
        setEvents(result.macro.events);
        setMacroName(result.macro.name);
        setMacroDescription(result.macro.description || '');
        setSettings(result.macro.settings || DEFAULT_SETTINGS);
      }
    } catch (error) {
      console.error('Failed to load macro:', error);
      alert('加载失败');
    }
  };

  const handleDeleteMacro = async (id: string) => {
    if (!window.electronAPI) return;

    if (confirm('确定要删除这个宏吗？')) {
      try {
        await window.electronAPI.deleteMacro(id);
        await loadSavedMacros();
      } catch (error) {
        console.error('Failed to delete macro:', error);
      }
    }
  };

  const handleSelectMacro = (macro: Macro) => {
    setEvents(macro.events);
    setMacroName(macro.name);
    setMacroDescription(macro.description || '');
    setSettings(macro.settings || DEFAULT_SETTINGS);
  };

  const handleSelectEvent = (id: string) => {
    setSelectedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedEvents.size === 0) return;
    if (confirm(`确定要删除选中的 ${selectedEvents.size} 个事件吗？`)) {
      setEvents(prev => prev.filter(e => !selectedEvents.has(e.id)));
      setSelectedEvents(new Set());
    }
  };

  return (
    <div className="app">
      <Header
        macroName={macroName}
        onMacroNameChange={setMacroName}
        isRecording={isRecording}
      />

      <ControlBar
        isRecording={isRecording}
        isPlaying={isPlaying}
        eventCount={events.length}
        onToggleRecording={handleToggleRecording}
        onTogglePlayback={handleTogglePlayback}
        onClearEvents={handleClearEvents}
        onSaveMacro={handleSaveMacro}
        onLoadMacro={handleLoadMacro}
        onOpenSettings={() => setShowSettings(true)}
        playbackProgress={playbackProgress}
      />

      <main className="main-content">
        <div className="event-panel">
          <div className="panel-header">
            <h2>录制的事件</h2>
            <span className="event-count">{events.length} 个事件</span>
          </div>

          <div className={`capture-area ${isRecording ? 'recording' : ''}`}>
            {isRecording ? (
              <div className="recording-indicator">
                <span className="pulse"></span>
                正在录制（可在后台捕获操作）...
              </div>
            ) : (
              <div className="idle-indicator">
                点击"开始录制"或按 Ctrl+Shift+R 捕获您的操作
              </div>
            )}
          </div>

          <EventList
            events={events}
            selectedEvents={selectedEvents}
            onSelectEvent={handleSelectEvent}
            onDeleteEvent={handleDeleteEvent}
            onEditEvent={handleEditEvent}
            editingEvent={editingEvent}
            onSaveEvent={handleSaveEvent}
            onCancelEdit={() => setEditingEvent(null)}
            onDeleteSelected={handleDeleteSelected}
            selectedCount={selectedEvents.size}
          />
        </div>

        <SavedMacros
          macros={savedMacros}
          onSelectMacro={handleSelectMacro}
          onDeleteMacro={handleDeleteMacro}
          onRefresh={loadSavedMacros}
        />
      </main>

      {showSettings && (
        <MacroSettingsPanel
          settings={settings}
          onSettingsChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <footer className="footer">
        <div className="shortcuts-hint">
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> 开始/停止录制
          <span className="separator">|</span>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> 开始/停止回放
        </div>
      </footer>
    </div>
  );
}

export default App;
