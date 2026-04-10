import React from 'react';
import './ControlBar.css';

interface ControlBarProps {
  isRecording: boolean;
  isPlaying: boolean;
  eventCount: number;
  onToggleRecording: () => void;
  onTogglePlayback: () => void;
  onClearEvents: () => void;
  onSaveMacro: () => void;
  onLoadMacro: () => void;
  onOpenSettings: () => void;
  playbackProgress: { current: number; total: number; percentage: number };
}

const ControlBar: React.FC<ControlBarProps> = ({
  isRecording,
  isPlaying,
  eventCount,
  onToggleRecording,
  onTogglePlayback,
  onClearEvents,
  onSaveMacro,
  onLoadMacro,
  onOpenSettings,
  playbackProgress,
}) => {
  return (
    <div className="control-bar">
      <div className="control-group primary">
        <button
          className={`control-btn record ${isRecording ? 'active' : ''}`}
          onClick={onToggleRecording}
          disabled={isPlaying}
        >
          <span className="btn-icon">{isRecording ? '⏹' : '⏺'}</span>
          <span className="btn-label">{isRecording ? '停止录制' : '开始录制'}</span>
        </button>
        
        <button
          className={`control-btn play ${isPlaying ? 'active' : ''}`}
          onClick={onTogglePlayback}
          disabled={isRecording || eventCount === 0}
        >
          <span className="btn-icon">{isPlaying ? '⏸' : '▶'}</span>
          <span className="btn-label">{isPlaying ? '停止回放' : '回放'}</span>
        </button>
      </div>

      {isPlaying && playbackProgress.total > 0 && (
        <div className="progress-container">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${playbackProgress.percentage}%` }}
            />
          </div>
          <span className="progress-text">
            {playbackProgress.current} / {playbackProgress.total}
          </span>
        </div>
      )}

      <div className="control-group secondary">
        <button
          className="control-btn secondary"
          onClick={onClearEvents}
          disabled={eventCount === 0 || isRecording || isPlaying}
        >
          <span className="btn-icon">🗑</span>
          <span className="btn-label">清空</span>
        </button>
        
        <button
          className="control-btn secondary"
          onClick={onLoadMacro}
          disabled={isRecording || isPlaying}
        >
          <span className="btn-icon">📂</span>
          <span className="btn-label">加载</span>
        </button>
        
        <button
          className="control-btn secondary"
          onClick={onSaveMacro}
          disabled={eventCount === 0 || isRecording || isPlaying}
        >
          <span className="btn-icon">💾</span>
          <span className="btn-label">保存</span>
        </button>
        
        <button
          className="control-btn secondary"
          onClick={onOpenSettings}
          disabled={isRecording || isPlaying}
        >
          <span className="btn-icon">⚙️</span>
          <span className="btn-label">设置</span>
        </button>
      </div>
    </div>
  );
};

export default ControlBar;
