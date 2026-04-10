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
          <h2>设置</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-body">
          <h3 className="settings-section-title">回放设置</h3>

          <div className="setting-item">
            <div className="setting-info">
              <label>回放速度</label>
              <span className="setting-desc">调整回放的速度倍率</span>
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
              <label>循环次数</label>
              <span className="setting-desc">设置为 0 表示无限循环</span>
            </div>
            <div className="setting-control">
              <input
                type="number"
                min="0"
                max="100"
                value={settings.loopCount}
                onChange={(e) => handleChange('loopCount', parseInt(e.target.value) || 0)}
              />
              <span className="setting-unit">次</span>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label>循环间隔</label>
              <span className="setting-desc">每次循环之间的等待时间</span>
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

          <h3 className="settings-section-title">录制灵敏度（鼠标）</h3>

          <div className="setting-item">
            <div className="setting-info">
              <label>点击去重阈值</label>
              <span className="setting-desc">触控板连续点击的最小间隔，越小越灵敏（默认20ms）</span>
            </div>
            <div className="setting-control">
              <input
                type="range"
                min="10"  // ★ 降低最小值到10ms
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
              <label>移动节流间隔</label>
              <span className="setting-desc">鼠标移动事件的采样间隔，越小轨迹越精细（默认16ms≈60fps）</span>
            </div>
            <div className="setting-control">
              <input
                type="range"
                min="8"  // ★ 降低最小值到8ms
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
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default MacroSettingsPanel;
