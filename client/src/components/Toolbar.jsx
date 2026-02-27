import { useState, useRef } from 'react';
import { HexColorPicker } from 'react-colorful';

const STROKE_COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#ffffff'];
const BG_COLORS = ['transparent', '#ffffff', '#f8f9fa', '#fff3bf', '#d3f9d8', '#dbe4ff', '#1e1e1e', '#2b2b2b'];

export default function Toolbar({
  tool, setTool,
  color, setColor,
  brushSize, setBrushSize,
  bgColor, setBgColor,
  onUndo, onRedo, onClear, onSave,
  onRecordToggle, isRecording,
  onScreenShare, isSharingScreen,
  onFileShare,
  isHost,
}) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showProps, setShowProps] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const fileRef = useRef();

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) onFileShare(file);
    e.target.value = '';
  };

  return (
    <>
      {/* ═══ TOP CENTER: Tool bar ═══ */}
      <div className={`exc-toolbar ${collapsed ? 'collapsed' : ''}`}>
        {/* Collapse toggle */}
        <button
          className="exc-tool exc-collapse-btn"
          onClick={() => setCollapsed(v => !v)}
          data-tooltip={collapsed ? 'Show toolbar' : 'Hide toolbar'}
        >
          <span className="icon">{collapsed ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}</span>
        </button>

        {!collapsed && (
          <>
            {/* Toggle properties panel */}
            <button
              className={`exc-tool ${showProps ? 'active' : ''}`}
              onClick={() => setShowProps(v => !v)}
              data-tooltip="Properties"
            >
              <span className="icon">tune</span>
            </button>

            <div className="exc-divider" />

            <button className={`exc-tool ${tool === 'pencil' ? 'active' : ''}`}
              onClick={() => setTool('pencil')} data-tooltip="Pencil">
              <span className="icon">edit</span></button>
            <button className={`exc-tool ${tool === 'eraser' ? 'active' : ''}`}
              onClick={() => setTool('eraser')} data-tooltip="Eraser">
              <span className="icon">ink_eraser</span></button>

            <div className="exc-divider" />

            <button className={`exc-tool ${tool === 'rectangle' ? 'active' : ''}`}
              onClick={() => setTool('rectangle')} data-tooltip="Rectangle">
              <span className="icon">rectangle</span></button>
            <button className={`exc-tool ${tool === 'circle' ? 'active' : ''}`}
              onClick={() => setTool('circle')} data-tooltip="Circle">
              <span className="icon">circle</span></button>
            <button className={`exc-tool ${tool === 'line' ? 'active' : ''}`}
              onClick={() => setTool('line')} data-tooltip="Line">
              <span className="icon">pen_size_1</span></button>
            <button className={`exc-tool ${tool === 'arrow' ? 'active' : ''}`}
              onClick={() => setTool('arrow')} data-tooltip="Arrow">
              <span className="icon">arrow_right_alt</span></button>

            <div className="exc-divider" />

            <button className={`exc-tool ${tool === 'text' ? 'active' : ''}`}
              onClick={() => setTool('text')} data-tooltip="Text">
              <span className="icon">title</span></button>
            <button className={`exc-tool ${tool === 'laser' ? 'active' : ''}`}
              onClick={() => setTool('laser')} data-tooltip="Laser">
              <span className="icon" style={tool === 'laser' ? { color: '#ef4444' } : {}}>flare</span></button>

            <div className="exc-divider" />

            {/* Quick color indicator */}
            <div
              className="exc-color-indicator"
              style={{ background: color }}
              onClick={() => setShowProps(true)}
              title="Open properties"
            />

            <div className="exc-divider" />

            <button className="exc-tool" onClick={onScreenShare}
              data-tooltip={isSharingScreen ? 'Stop share' : 'Screen share'}>
              <span className="icon">{isSharingScreen ? 'stop_screen_share' : 'screen_share'}</span></button>
            <button className="exc-tool" onClick={() => fileRef.current.click()} data-tooltip="Share file">
              <span className="icon">attach_file</span></button>
            <button className={`exc-tool ${isRecording ? 'recording' : ''}`}
              onClick={onRecordToggle} data-tooltip={isRecording ? 'Stop' : 'Record'}>
              <span className="icon">{isRecording ? 'stop_circle' : 'radio_button_checked'}</span></button>
            <button className="exc-tool" onClick={onSave} data-tooltip="Save">
              <span className="icon">save</span></button>
            {isHost && (
              <button className="exc-tool danger" onClick={onClear} data-tooltip="Clear">
                <span className="icon">delete</span></button>
            )}
          </>
        )}

        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {/* ═══ LEFT PANEL: Properties (collapsible) ═══ */}
      {showProps && (
        <div className="exc-props-panel">
          <div className="exc-props-header">
            <span className="exc-prop-label" style={{ margin: 0 }}>Properties</span>
            <button className="exc-props-close" onClick={() => setShowProps(false)}>
              <span className="icon" style={{ fontSize: '16px' }}>close</span>
            </button>
          </div>

          {/* Stroke color */}
          <div className="exc-prop-section">
            <span className="exc-prop-label">Stroke</span>
            <div className="exc-prop-colors">
              {STROKE_COLORS.map((c) => (
                <button
                  key={c}
                  className={`exc-color-dot ${color === c ? 'active' : ''}`}
                  style={{ background: c, border: c === '#ffffff' ? '1.5px solid var(--border-hover)' : 'none' }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <button className="exc-prop-btn" onClick={() => setShowColorPicker(v => !v)}>
                <span className="icon">palette</span> Custom
              </button>
              {showColorPicker && (
                <div className="exc-prop-popup">
                  <HexColorPicker color={color} onChange={setColor} />
                  <button className="btn-sm" onClick={() => setShowColorPicker(false)}>
                    <span className="icon" style={{ fontSize: '14px', verticalAlign: 'middle' }}>check</span> Done
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Background color */}
          <div className="exc-prop-section">
            <span className="exc-prop-label">Background</span>
            <div className="exc-prop-colors">
              {BG_COLORS.map((c) => (
                <button
                  key={c}
                  className={`exc-color-dot ${bgColor === c ? 'active' : ''}`}
                  style={{
                    background: c === 'transparent'
                      ? 'repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 50% / 10px 10px'
                      : c,
                    border: ['#ffffff', '#f8f9fa'].includes(c) ? '1.5px solid var(--border-hover)' : 'none',
                  }}
                  onClick={() => setBgColor(c)}
                  title={c === 'transparent' ? 'None' : c}
                />
              ))}
            </div>
          </div>

          {/* Stroke width */}
          <div className="exc-prop-section">
            <span className="exc-prop-label">Stroke width</span>
            <div className="exc-prop-row">
              <button className={`exc-width-btn ${brushSize <= 2 ? 'active' : ''}`} onClick={() => setBrushSize(1)}>
                <span style={{ display: 'block', height: '1px', width: '20px', background: 'currentColor' }} />
              </button>
              <button className={`exc-width-btn ${brushSize > 2 && brushSize <= 5 ? 'active' : ''}`} onClick={() => setBrushSize(3)}>
                <span style={{ display: 'block', height: '2.5px', width: '20px', background: 'currentColor', borderRadius: '2px' }} />
              </button>
              <button className={`exc-width-btn ${brushSize > 5 ? 'active' : ''}`} onClick={() => setBrushSize(8)}>
                <span style={{ display: 'block', height: '4px', width: '20px', background: 'currentColor', borderRadius: '2px' }} />
              </button>
            </div>
            <input
              type="range" min="1" max="40" value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="exc-slider-full"
            />
          </div>
        </div>
      )}

      {/* ═══ BOTTOM LEFT: Undo / Redo ═══ */}
      <div className="exc-bottom-left">
        <button className="exc-tool" onClick={onUndo} data-tooltip="Undo">
          <span className="icon">undo</span></button>
        <button className="exc-tool" onClick={onRedo} data-tooltip="Redo">
          <span className="icon">redo</span></button>
      </div>
    </>
  );
}
