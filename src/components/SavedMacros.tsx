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
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="saved-macros">
      <div className="saved-macros-header">
        <h2>Saved Macros</h2>
        <button className="refresh-btn" onClick={onRefresh} title="Refresh">
          🔄
        </button>
      </div>

      <div className="macros-list">
        {macros.length === 0 ? (
          <div className="empty-macros">
            <span className="empty-icon">📁</span>
            <p>No saved macros</p>
            <p className="empty-hint">Record and save macros to see them here</p>
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
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
              
              {macro.description && (
                <p className="macro-description">{macro.description}</p>
              )}
              
              <div className="macro-meta">
                <span className="macro-events">
                  📋 {macro.events.length} events
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
