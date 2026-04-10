import React from 'react';
import { Macro } from '../types';
import './SavedMacros.css';

interface SavedMacrosProps {
  macros: Macro[];
  onSelectMacro: (macro: Macro) => void;
  onDeleteMacro: (id: string) => void;
  onRefresh: () => void;
}

const SavedMacros: React.FC<SavedMacrosProps> = ({
  macros,
  onSelectMacro,
  onDeleteMacro,
  onRefresh,
}) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="saved-macros">
      <div className="saved-macros-header">
        <h2>已保存的宏</h2>
        <button className="refresh-btn" onClick={onRefresh} title="刷新">
          🔄
        </button>
      </div>

      <div className="macros-list">
        {macros.length === 0 ? (
          <div className="empty-macros">
            <span className="empty-icon">📁</span>
            <p>暂无保存的宏</p>
            <p className="empty-hint">录制并保存后将在此显示</p>
          </div>
        ) : (
          macros.map((macro) => (
            <div
              key={macro.id}
              className="macro-card"
              onClick={() => onSelectMacro(macro)}
            >
              <div className="macro-card-header">
                <span className="macro-name">{macro.name}</span>
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteMacro(macro.id);
                  }}
                  title="删除"
                >
                  🗑️
                </button>
              </div>
              
              {macro.description && (
                <p className="macro-description">{macro.description}</p>
              )}
              
              <div className="macro-meta">
                <span className="macro-events">
                  📋 {macro.events.length} 个事件
                </span>
                <span className="macro-date">
                  {formatDate(macro.createdAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SavedMacros;
