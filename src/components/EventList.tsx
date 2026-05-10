import React from 'react';
import { RecordedEvent, EventType } from '../types';
import './EventList.css';

/** Mouse button display labels */
const MOUSE_BTN_CN: Record<string, string> = { left: 'Left', middle: 'Middle', right: 'Right' };

/** Get display label for mouse button */
function getButtonLabel(data: { button?: unknown }): string {
  if (typeof data.button === 'string') return MOUSE_BTN_CN[data.button] || data.button;
  return 'Left';
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
        return `Down ${data.key || 'Unknown'}`;
      case 'keyup': {
        // Distinguish tap vs hold
        const holdInfo = data.isHold
          ? ` [Hold ${(data.holdDuration || 0).toFixed(0)}ms]`
          : '';
        return `Up ${data.key || 'Unknown'}${holdInfo}`;
      }
      case 'mousedown':
        return `Click ${getButtonLabel(data)} (${data.x}, ${data.y})`;
      case 'mouseup':
        return `Release ${getButtonLabel(data)} (${data.x}, ${data.y})`;
      case 'mousemove':
        return `Move to (${data.x}, ${data.y})`;
      case 'wheel':
        return `Scroll (${data.deltaX}, ${data.deltaY})`;
      default:
        return type;
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
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
          <p>No recorded events</p>
          <p className="empty-hint">Click "Record" to start capturing your actions</p>
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
          <span>Select all</span>
        </label>
        {selectedCount > 0 && (
          <button className="delete-selected-btn" onClick={onDeleteSelected}>
            Delete selected ({selectedCount})
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
                title="Edit"
              >
                ✏️
              </button>
              <button
                className="action-btn delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEvent(event.id);
                }}
                title="Delete"
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
          <h3>Edit Event</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Event Type</label>
            <select
              value={editedEvent.type}
              onChange={(e) => setEditedEvent({ ...editedEvent, type: e.target.value as EventType })}
            >
              <option value="keydown">Key Down</option>
              <option value="keyup">Key Up</option>
              <option value="mousedown">Mouse Down</option>
              <option value="mouseup">Mouse Up</option>
              <option value="mousemove">Mouse Move</option>
              <option value="wheel">Mouse Wheel</option>
            </select>
          </div>
          
          {editedEvent.type.includes('key') && (
            <>
              <div className="form-group">
                <label>Key</label>
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
                <label>X</label>
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
                <label>Y</label>
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
                <label>Horizontal Scroll</label>
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
                <label>Vertical Scroll</label>
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
            <label>Delay (ms)</label>
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
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventList;
