import React from 'react';
import './Header.css';

interface HeaderProps {
  macroName: string;
  onMacroNameChange: (name: string) => void;
  isRecording: boolean;
}

const Header: React.FC<HeaderProps> = ({ macroName, onMacroNameChange, isRecording }) => {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-icon">⌨️</span>
          <span className="logo-text">MacroRecorder</span>
        </div>
      </div>
      
      <div className="header-center">
        <input
          type="text"
          className="macro-name-input"
          value={macroName}
          onChange={(e) => onMacroNameChange(e.target.value)}
          placeholder="输入宏名称..."
          disabled={isRecording}
        />
      </div>
      
      <div className="header-right">
        <div className="status-badge">
          <span className={`status-dot ${isRecording ? 'recording' : 'idle'}`}></span>
          {isRecording ? '录制中' : '就绪'}
        </div>
      </div>
    </header>
  );
};

export default Header;
