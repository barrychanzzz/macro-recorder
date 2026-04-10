import React from 'react';
import { RecordedEvent, EventType } from '../types';
import './EventList.css';

/** 鼠标按钮名 → 中文显示 */
const MOUSE_BTN_CN: Record<string, string> = { left: '左键', middle: '中键', right: '右键' };

/** 解析鼠标按钮的中文显示名称 */
function getButtonLabel(data: { button?: unknown }): string {
  if (typeof data.button === 'string') return MOUSE_BTN_CN[data.button] || data.button;
  return '左键';
}

interface EventListProps {
  events: RecordedEvent[];
  selectedEvents: Set<string>;
  onSelectEvent: (id: string) => void;
  onDeleteEvent: (id: string) => void;
  onEditEvent: (event: RecordedEvent) => void;
  editingEvent: RecordedEvent | null;
  onSaveEvent: (event: RecordedEvent) => void;
  onCancelEdit: () => void;
  onDeleteSelected: () => void;
  selectedCount: number;
}

const EventList: React.FC<EventListProps> = ({
  events,
  selectedEvents,
  onSelectEvent,
  onDeleteEvent,
  onEditEvent,
  editingEvent,
  onSaveEvent,
  onCancelEdit,
  onDeleteSelected,
  selectedCount,
}) => {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'keydown':
      case 'keyup':
        return '⌨️';
      case 'mousedown':
      case 'mouseup':
        return '🖱️';
      case 'mousemove':
        return '↔️';
      case 'wheel':
        return '🛞';
      default:
        return '📝';
    }
  };

  const getEventLabel = (event: RecordedEvent) => {
    const { type, data } = event;
    switch (type) {
      case 'keydown':
        return `按下 ${data.key || 'Unknown'}`;
      case 'keyup': {
        // ★ 区分短按与长按
        const holdInfo = data.isHold
          ? ` [长按 ${(data.holdDuration || 0).toFixed(0)}ms]`
          : '';
        return `释放 ${data.key || 'Unknown'}${holdInfo}`;
      }
      case 'mousedown':
        return `点击 ${getButtonLabel(data)} (${data.x}, ${data.y})`;
      case 'mouseup':
        return `释放 ${getButtonLabel(data)} (${data.x}, ${data.y})`;
      case 'mousemove':
        return `移动到 (${data.x}, ${data.y})`;
      case 'wheel':
        return `滚动 (${data.deltaX}, ${data.deltaY})`;
      default:
        return type;
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDelay = (delay: number) => {
    if (delay < 1000) return `${delay}ms`;
    return `${(delay / 1000).toFixed(2)}s`;
  };

  if (events.length === 0) {
    return (
      <div className="event-list empty">
        <div className="empty-state">
          <span className="empty-icon">📋</span>
          <p>暂无录制的事件</p>
          <p className="empty-hint">点击"开始录制"按钮开始捕获您的操作</p>
        </div>
      </div>
    );
  }

  return (
    <div className="event-list">
      <div className="event-list-header">
        <label className="select-all">
          <input
            type="checkbox"
            checked={selectedEvents.size === events.length}
            onChange={() => {
              if (selectedEvents.size === events.length) {
                events.forEach(e => onSelectEvent(e.id));
              } else {
                events.forEach(e => !selectedEvents.has(e.id) && onSelectEvent(e.id));
              }
            }}
          />
          <span>全选</span>
        </label>
        {selectedCount > 0 && (
          <button className="delete-selected-btn" onClick={onDeleteSelected}>
            删除所选 ({selectedCount})
          </button>
        )}
      </div>
      
      <div className="event-items">
        {events.map((event, index) => (
          <div
            key={event.id}
            className={`event-item ${selectedEvents.has(event.id) ? 'selected' : ''}`}
            onClick={() => onSelectEvent(event.id)}
          >
            <input
              type="checkbox"
              checked={selectedEvents.has(event.id)}
              onChange={() => onSelectEvent(event.id)}
              onClick={(e) => e.stopPropagation()}
            />
            
            <span className="event-index">{index + 1}</span>
            
            <span className="event-icon">{getEventIcon(event.type)}</span>
            
            <div className="event-info">
              <span className="event-type">{getEventLabel(event)}</span>
              <span className="event-meta">
                <span className="event-time">{formatTime(event.timestamp)}</span>
                {event.delay > 0 && (
                  <span className="event-delay">+{formatDelay(event.delay)}</span>
                )}
              </span>
            </div>
            
            <div className="event-actions">
              <button
                className="action-btn edit"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditEvent(event);
                }}
                title="编辑"
              >
                ✏️
              </button>
              <button
                className="action-btn delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEvent(event.id);
                }}
                title="删除"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingEvent && (
        <EventEditModal
          event={editingEvent}
          onSave={onSaveEvent}
          onCancel={onCancelEdit}
        />
      )}
    </div>
  );
};

interface EventEditModalProps {
  event: RecordedEvent;
  onSave: (event: RecordedEvent) => void;
  onCancel: () => void;
}

const EventEditModal: React.FC<EventEditModalProps> = ({ event, onSave, onCancel }) => {
  const [editedEvent, setEditedEvent] = React.useState(event);

  React.useEffect(() => {
    setEditedEvent(event);
  }, [event]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedEvent);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>编辑事件</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>事件类型</label>
            <select
              value={editedEvent.type}
              onChange={(e) => setEditedEvent({ ...editedEvent, type: e.target.value as EventType })}
            >
              <option value="keydown">按键按下</option>
              <option value="keyup">按键释放</option>
              <option value="mousedown">鼠标按下</option>
              <option value="mouseup">鼠标释放</option>
              <option value="mousemove">鼠标移动</option>
              <option value="wheel">滚轮滚动</option>
            </select>
          </div>
          
          {editedEvent.type.includes('key') && (
            <>
              <div className="form-group">
                <label>按键</label>
                <input
                  type="text"
                  value={editedEvent.data.key || ''}
                  onChange={(e) => setEditedEvent({
                    ...editedEvent,
                    data: { ...editedEvent.data, key: e.target.value }
                  })}
                />
              </div>
            </>
          )}
          
          {editedEvent.type.includes('mouse') && (
            <>
              <div className="form-group">
                <label>X 坐标</label>
                <input
                  type="number"
                  value={editedEvent.data.x || 0}
                  onChange={(e) => setEditedEvent({
                    ...editedEvent,
                    data: { ...editedEvent.data, x: parseInt(e.target.value) || 0 }
                  })}
                />
              </div>
              <div className="form-group">
                <label>Y 坐标</label>
                <input
                  type="number"
                  value={editedEvent.data.y || 0}
                  onChange={(e) => setEditedEvent({
                    ...editedEvent,
                    data: { ...editedEvent.data, y: parseInt(e.target.value) || 0 }
                  })}
                />
              </div>
            </>
          )}
          
          {editedEvent.type === 'wheel' && (
            <>
              <div className="form-group">
                <label>水平滚动</label>
                <input
                  type="number"
                  value={editedEvent.data.deltaX || 0}
                  onChange={(e) => setEditedEvent({
                    ...editedEvent,
                    data: { ...editedEvent.data, deltaX: parseInt(e.target.value) || 0 }
                  })}
                />
              </div>
              <div className="form-group">
                <label>垂直滚动</label>
                <input
                  type="number"
                  value={editedEvent.data.deltaY || 0}
                  onChange={(e) => setEditedEvent({
                    ...editedEvent,
                    data: { ...editedEvent.data, deltaY: parseInt(e.target.value) || 0 }
                  })}
                />
              </div>
            </>
          )}
          
          <div className="form-group">
            <label>延迟 (ms)</label>
            <input
              type="number"
              value={editedEvent.delay}
              onChange={(e) => setEditedEvent({
                ...editedEvent,
                delay: parseInt(e.target.value) || 0
              })}
            />
          </div>
          
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="btn-primary">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventList;
