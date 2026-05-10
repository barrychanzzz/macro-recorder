import React from 'react';
import { MacroSettings } from '../types';
import './MacroSettingsPanel.css';

interface MacroSettingsPanelProps {
  settings: MacroSettings;
  onSettingsChange: (settings: MacroSettings) => void;
  onClose: () => void;
}

const MacroSettingsPanel: React.FC<MacroSettingsPanelProps> = ({
  settings,
  onSettingsChange,
  onClose,
}) => {
  const handleChange = (key: keyof MacroSettings, value: number) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-body">
          <h3 className="settings-section-title">Playback</h3>

          <div className="setting-item">
            <div className="setting-info">
              <label>Speed</label>
              <span className="setting-desc">Adjust playback speed multiplier</span>
            </div>
            <div className="setting-control">
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={settings.playbackSpeed}
                onChange={(e) => handleChange('playbackSpeed', parseFloat(e.target.value))}
              />
              <span className="setting-value">{settings.playbackSpeed.toFixed(1)}x</span>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label>Loop Count</label>
              <span className="setting-desc">Set to 0 for infinite loop</span>
            </div>
            <div className="setting-control">
              <input
                type="number"
                min="0"
                max="100"
                value={settings.loopCount}
                onChange={(e) => handleChange('loopCount', parseInt(e.target.value) || 0)}
              />
              <span className="setting-unit">x</span>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label>Loop Interval</label>
              <span className="setting-desc">Wait time between each loop</span>
            </div>
            <div className="setting-control">
              <input
                type="number"
                min="0"
                max="10000"
                step="100"
                value={settings.loopDelay}
                onChange={(e) => handleChange('loopDelay', parseInt(e.target.value) || 0)}
              />
              <span className="setting-unit">ms</span>
            </div>
          </div>

          <hr className="settings-divider" />

          <h3 className="settings-section-title">Recording Sensitivity (Mouse)</h3>

          <div className="setting-item">
            <div className="setting-info">
              <label>Click Debounce</label>
              <span className="setting-desc">Min interval for consecutive clicks on trackpad (default 20ms)</span>
            </div>
            <div className="setting-control">
              <input
                type="range"
                min="10"  // Lower minimum to 10ms
                max="200"
                step="5"
                value={settings.mouseClickDebounceMs ?? 20}
                onChange={(e) => handleChange('mouseClickDebounceMs', parseInt(e.target.value))}
              />
              <span className="setting-value">{settings.mouseClickDebounceMs ?? 20}ms</span>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label>Move Throttle</label>
              <span className="setting-desc">Sampling interval for mouse move events (default 16ms≈60fps)</span>
            </div>
            <div className="setting-control">
              <input
                type="range"
                min="8"  // Lower minimum to 8ms
                max="100"
                step="4"
                value={settings.mouseMoveThrottleMs ?? 16}
                onChange={(e) => handleChange('mouseMoveThrottleMs', parseInt(e.target.value))}
              />
              <span className="setting-value">{settings.mouseMoveThrottleMs ?? 16}ms</span>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default MacroSettingsPanel;
