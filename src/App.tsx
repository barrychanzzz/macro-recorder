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
  mouseClickDebounceMs: 20,   // Mouse click debounce threshold (ms), default 20ms (preserves rapid-click ability)
  mouseMoveThrottleMs: 16,    // Mouse move throttle (ms), default 16ms (~60fps)
};

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [events, setEvents] = useState<RecordedEvent[]>([]);
  const [macroName, setMacroName] = useState('Untitled Macro');
  const [macroDescription, setMacroDescription] = useState('');
  const [settings, setSettings] = useState<MacroSettings>(DEFAULT_SETTINGS);
  const [playbackProgress, setPlaybackProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [savedMacros, setSavedMacros] = useState<Macro[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [editingEvent, setEditingEvent] = useState<RecordedEvent | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());

  // Use refs to keep latest values and avoid stale closure issues with keyboard shortcuts
  const eventsRef = useRef<RecordedEvent[]>([]);
  eventsRef.current = events;

  // Same for settings and isRecording
  const settingsRef = useRef<MacroSettings>(settings);
  settingsRef.current = settings;
  const isRecordingRef = useRef<boolean>(isRecording);
  isRecordingRef.current = isRecording;

  // Load saved macros
  useEffect(() => {
    loadSavedMacros();
  }, []);

  // Listen for events from main process (uiohook global capture, forwarded via IPC)
  useEffect(() => {
    if (!window.electronAPI) return;

    // Main process sends captured events via IPC
    const unsubEvent = window.electronAPI.onRecordingEvent((capturedEvent) => {
      setEvents(prev => [...prev, capturedEvent]);
    });

    // Playback progress updates
    const unsubProgress = window.electronAPI.onPlaybackProgress((progress) => {
      setPlaybackProgress(progress);
    });

    // Main process stopped recording via shortcut (cooldown protection handled in main)
    const unsubRecordingStopped = window.electronAPI.onRecordingStopped(() => {
      setIsRecording(false);
    });

    // Main process requests starting a new recording (needs frontend confirmation)
    const unsubRequestStart = window.electronAPI.onRequestStartRecord(() => {
      handleStartRecordingWithConfirm();
    });

    // Global shortcut: Ctrl+Shift+P to toggle playback
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

  /** Start recording with confirmation dialog (shared by shortcut and button) */
  const handleStartRecordingWithConfirm = useCallback(async () => {
    if (!window.electronAPI) return;
    if (isRecordingRef.current) return; // Already recording, ignore

    // Always read latest values from refs
    const currentEvents = eventsRef.current;

    // Confirm before starting new recording if there are existing events
    if (currentEvents.length > 0) {
      if (!confirm('⚠️ Starting a new recording will clear ' + currentEvents.length + ' recorded events. Continue?')) return;
    }
    setEvents([]); // Clear

    // Sync sensitivity settings to main process
    const currentSettings = settingsRef.current;
    await window.electronAPI.setSensitivity({
      mouseClickDebounceMs: currentSettings.mouseClickDebounceMs ?? 60,
      mouseMoveThrottleMs: currentSettings.mouseMoveThrottleMs ?? 30,
    });

    await window.electronAPI.startRecording();
    setIsRecording(true);
  }, []); // No deps — all dynamic values read via refs

  /** UI button click → toggle recording */
  const handleToggleRecording = async () => {
    if (!window.electronAPI) return;

    if (isRecording) {
      // Button click to stop recording (not via shortcut path)
      await window.electronAPI.stopRecording();
      setIsRecording(false);
    } else {
      // Button click to start recording (with confirmation)
      await handleStartRecordingWithConfirm();
    }
  };

  const handleTogglePlayback = async () => {
    if (!window.electronAPI) return;

    // Always read latest values from refs (avoid stale closure state)
    const currentEvents = eventsRef.current;
    const currentSettings = settingsRef.current;

    if (isPlaying) {
      await window.electronAPI.stopPlayback();
      setIsPlaying(false);
      setPlaybackProgress({ current: 0, total: 0, percentage: 0 });
    } else {
      if (currentEvents.length === 0) {
        alert('No events to play back');
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
    if (confirm('Are you sure you want to clear all events?')) {
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
      alert('Macro saved successfully!');
    } catch (error) {
      console.error('Failed to save macro:', error);
      alert('Failed to save');
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
      alert('Failed to load');
    }
  };

  const handleDeleteMacro = async (id: string) => {
    if (!window.electronAPI) return;

    if (confirm('Are you sure you want to delete this macro?')) {
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
    if (confirm(`Are you sure you want to delete ${selectedEvents.size} selected events?`)) {
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
            <h2>Recorded Events</h2>
            <span className="event-count">{events.length} events</span>
          </div>

          <div className={`capture-area ${isRecording ? 'recording' : ''}`}>
            {isRecording ? (
              <div className="recording-indicator">
                <span className="pulse"></span>
                Recording (capturing in background)...
              </div>
            ) : (
              <div className="idle-indicator">
                Click "Record" or press Ctrl+Shift+R to capture your actions
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
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> Start/Stop Recording
          <span className="separator">|</span>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> Start/Stop Playback
        </div>
      </footer>
    </div>
  );
}

export default App;
