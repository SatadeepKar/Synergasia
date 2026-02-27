import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from 'react';

const Canvas = forwardRef(function Canvas({ socket, roomId, tool, color, brushSize, bgColor, zoom }, ref) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const containerRef = useRef(null);
  const isDrawing = useRef(false);
  
  // Transform state (Pan)
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastPanPos = useRef({ x: 0, y: 0 });

  const startPos = useRef(null);
  const lastPos = useRef(null);
  
  const scale = zoom / 100;
  const prevScaleRef = useRef(scale);

  // Adjust offset when zoom changes so viewport center stays fixed
  useEffect(() => {
    const oldScale = prevScaleRef.current;
    const newScale = scale;
    if (oldScale !== newScale) {
      const canvas = canvasRef.current;
      if (canvas) {
        // Viewport center in screen coords
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        // Adjust offset so the world point at center stays at center
        setOffset(prev => ({
          x: cx - (newScale / oldScale) * (cx - prev.x),
          y: cy - (newScale / oldScale) * (cy - prev.y),
        }));
      }
      prevScaleRef.current = newScale;
    }
  }, [scale]);

  // We store strokes instead of imageData to allow infinite redrawing/rescaling
  const strokesRef = useRef([]);
  const redoStackRef = useRef([]);
  const hasLoadedInitialState = useRef(false);

  const laserTrail = useRef([]);
  const laserAnimFrame = useRef(null);

  const getCtx = () => canvasRef.current?.getContext('2d');
  const getOverlayCtx = () => overlayRef.current?.getContext('2d');

  // ── Draw a shape on a given context (MUST be defined before redraw) ──
  const drawShape = useCallback((ctx, shapeTool, from, to, c, bs) => {
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = c;
    ctx.lineWidth = bs;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);
    const w = Math.abs(to.x - from.x);
    const h = Math.abs(to.y - from.y);

    switch (shapeTool) {
      case 'rectangle':
        ctx.strokeRect(x, y, w, h);
        break;
      case 'circle': {
        const cx = (from.x + to.x) / 2;
        const cy = (from.y + to.y) / 2;
        const rx = w / 2;
        const ry = h / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'line':
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        break;
      case 'arrow': {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        // arrowhead
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const headLen = Math.max(12, bs * 3);
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - headLen * Math.cos(angle - 0.4), to.y - headLen * Math.sin(angle - 0.4));
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - headLen * Math.cos(angle + 0.4), to.y - headLen * Math.sin(angle + 0.4));
        ctx.stroke();
        break;
      }
      default: break;
    }
  }, []);

  // ── Render all strokes ─────────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear and apply transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Fill background if any
    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.setTransform(scale, 0, 0, scale, offset.x, offset.y);

    strokesRef.current.forEach(stroke => {
      if (stroke.type === 'shape') {
        drawShape(ctx, stroke.tool, stroke.from, stroke.to, stroke.color, stroke.brushSize);
      } else if (stroke.type === 'text') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = `${Math.max(16, stroke.brushSize * 2)}px "DM Sans", sans-serif`;
        ctx.fillStyle = stroke.color;
        ctx.textBaseline = 'top';
        const lines = stroke.text.split('\n');
        const lineHeight = Math.max(16, stroke.brushSize * 2) * 1.3;
        lines.forEach((line, i) => {
          ctx.fillText(line, stroke.pos.x, stroke.pos.y + i * lineHeight);
        });
      } else if (stroke.points && stroke.points.length > 0) {
        // Freehand / eraser stroke with multiple points
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (stroke.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.lineWidth = stroke.brushSize * 2;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.brushSize;
        }
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for(let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
    });
  }, [offset, scale, bgColor, drawShape]);

  // ── Resize using ResizeObserver ────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      if (canvas && overlay) {
        canvas.width = width;
        canvas.height = height;
        overlay.width = width;
        overlay.height = height;
        redraw();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // ── Snapshot / State sync ─────────────────────────────────────
  const syncState = useCallback(() => {
    socket?.emit('save-canvas', {
      roomId,
      canvasState: JSON.stringify(strokesRef.current),
    });
  }, [socket, roomId]);

  // ── Expose imperative actions ──────────────────────────────────
  useImperativeHandle(ref, () => ({
    undo() {
      if (strokesRef.current.length === 0) return;
      const removed = strokesRef.current.pop();
      redoStackRef.current.push(removed);
      redraw();
      syncState();
    },
    redo() {
      if (redoStackRef.current.length === 0) return;
      const restored = redoStackRef.current.pop();
      strokesRef.current.push(restored);
      redraw();
      syncState();
    },
    clear() {
      strokesRef.current = [];
      redoStackRef.current = [];
      redraw();
      syncState();
    },
    getDataURL() { 
      // Force white background if clear
      const canvas = document.createElement('canvas');
      canvas.width = canvasRef.current.width;
      canvas.height = canvasRef.current.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor === 'transparent' ? '#ffffff' : bgColor;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(canvasRef.current, 0, 0);
      return canvas.toDataURL('image/png'); 
    },
    getCanvasState() { return JSON.stringify(strokesRef.current); },
    loadState(stateJSON) {
      if (hasLoadedInitialState.current) return;
      if (!stateJSON || stateJSON === '[]') return;
      // Handle legacy image data
      if (typeof stateJSON === 'string' && stateJSON.startsWith('data:image')) {
        console.warn('Skipping legacy image sync - vector strokes only');
        return;
      }
      try {
        const arr = JSON.parse(stateJSON);
        if (Array.isArray(arr)) {
          strokesRef.current = arr;
          redraw();
          hasLoadedInitialState.current = true;
        }
      } catch (e) { console.error('Failed to load canvas state', e); }
    },
  }));

  // ── Get pointer pos (mapped to world coords) ───────────────────
  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let cx, cy;
    if (e.touches && e.touches.length > 0) {
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    } else {
      cx = e.clientX;
      cy = e.clientY;
    }
    // Convert screen coordinates to canvas world coordinates
    return { 
      x: (cx - rect.left - offset.x) / scale, 
      y: (cy - rect.top - offset.y) / scale 
    };
  };

  // ── Apply a single freehand stroke segment ─────────────────────
  const applyStrokeSegment = useCallback((ctx, stroke) => {
    if (!ctx) return;
    const { tool: t, color: c, brushSize: bs, from, to } = stroke;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (t === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = bs * 2;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = c;
      ctx.lineWidth = bs;
    }
    ctx.setTransform(scale, 0, 0, scale, offset.x, offset.y);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }, [scale, offset]);

  // ── Laser trail animation ──────────────────────────────────────
  const animateLaser = useCallback(() => {
    const ovCtx = getOverlayCtx();
    const overlay = overlayRef.current;
    if (!ovCtx || !overlay) return;
    ovCtx.setTransform(1, 0, 0, 1, 0, 0);
    ovCtx.clearRect(0, 0, overlay.width, overlay.height);
    ovCtx.setTransform(scale, 0, 0, scale, offset.x, offset.y);

    const now = Date.now();
    // Remove points older than 800ms
    laserTrail.current = laserTrail.current.filter(p => now - p.t < 800);

    if (laserTrail.current.length > 1) {
      for (let i = 1; i < laserTrail.current.length; i++) {
        const p0 = laserTrail.current[i - 1];
        const p1 = laserTrail.current[i];
        const age = (now - p1.t) / 800; // 0..1
        const alpha = 1 - age;
        const width = 3 * (1 - age * 0.5);
        ovCtx.globalCompositeOperation = 'lighter';
        ovCtx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
        ovCtx.lineWidth = width;
        ovCtx.lineCap = 'round';
        ovCtx.beginPath();
        ovCtx.moveTo(p0.x, p0.y);
        ovCtx.lineTo(p1.x, p1.y);
        ovCtx.stroke();
        // glow
        ovCtx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.3})`;
        ovCtx.lineWidth = width * 3;
        ovCtx.beginPath();
        ovCtx.moveTo(p0.x, p0.y);
        ovCtx.lineTo(p1.x, p1.y);
        ovCtx.stroke();
      }
    }

    // Draw laser dot at current position
    if (laserTrail.current.length > 0) {
      const last = laserTrail.current[laserTrail.current.length - 1];
      const dotAge = (now - last.t) / 800;
      if (dotAge < 1) {
        const dotAlpha = 1 - dotAge;
        ovCtx.beginPath();
        ovCtx.arc(last.x, last.y, 5, 0, Math.PI * 2);
        ovCtx.fillStyle = `rgba(239, 68, 68, ${dotAlpha})`;
        ovCtx.fill();
        ovCtx.beginPath();
        ovCtx.arc(last.x, last.y, 10, 0, Math.PI * 2);
        ovCtx.fillStyle = `rgba(239, 68, 68, ${dotAlpha * 0.15})`;
        ovCtx.fill();
      }
    }

    if (laserTrail.current.length > 0) {
      laserAnimFrame.current = requestAnimationFrame(animateLaser);
    }
  }, [scale, offset]);

  const isShapeTool = (t) => ['rectangle', 'circle', 'line', 'arrow'].includes(t);

  // ── Pointer events ─────────────────────────────────────────────
  const startDraw = (e) => {
    // Disable native pinch-to-zoom interference
    if (e.touches && e.touches.length > 1) return;
    
    // Middle mouse button or Alt+drag for panning
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning.current = true;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (tool === 'blocked') return; // drawing disabled
    const pos = getPos(e);
    isDrawing.current = true;
    startPos.current = pos;
    lastPos.current = pos;
    
    if (tool === 'pencil' || tool === 'eraser') {
      // Clear redo stack when drawing something new
      redoStackRef.current = [];
      // Start a new freehand stroke
      strokesRef.current.push({
        type: 'freehand',
        tool,
        color,
        brushSize,
        points: [pos]
      });
    }

    if (tool === 'laser') {
      laserTrail.current = [{ ...pos, t: Date.now() }];
      cancelAnimationFrame(laserAnimFrame.current);
      laserAnimFrame.current = requestAnimationFrame(animateLaser);
      socket?.emit('draw', { roomId, stroke: { tool: 'laser', points: [{ ...pos, t: Date.now() }] } });
    }

    if (tool === 'text') {
      // Check if clicking on an existing text stroke to edit it
      const hitIndex = findTextStrokeAt(pos);
      if (hitIndex >= 0) {
        const existingStroke = strokesRef.current[hitIndex];
        // Remove old stroke locally AND notify remote clients
        strokesRef.current.splice(hitIndex, 1);
        socket?.emit('stroke-remove', { roomId, index: hitIndex });
        redoStackRef.current = [];
        redraw();
        createTextInput(existingStroke.pos, existingStroke.text, existingStroke.color, existingStroke.brushSize);
      } else {
        createTextInput(pos);
      }
      isDrawing.current = false;
    }
  };

  // Mouse wheel for panning
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setOffset(prev => ({
      x: prev.x - e.deltaX,
      y: prev.y - e.deltaY,
    }));
  }, []);

  useEffect(() => {
    const canvas = document.getElementById('main-canvas');
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const draw = useCallback((e) => {
    if (e.touches && e.touches.length > 1) return;
    
    if (isPanning.current) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!isDrawing.current) return;
    const pos = getPos(e);

    if (tool === 'laser') {
      laserTrail.current.push({ ...pos, t: Date.now() });
      socket?.emit('draw', { roomId, stroke: { tool: 'laser', points: [{ ...pos, t: Date.now() }] } });
      return;
    }

    if (isShapeTool(tool)) {
      // Preview shape on overlay canvas
      const ovCtx = getOverlayCtx();
      const overlay = overlayRef.current;
      if (!ovCtx || !overlay) return;
      ovCtx.setTransform(1, 0, 0, 1, 0, 0);
      ovCtx.clearRect(0, 0, overlay.width, overlay.height);
      ovCtx.setTransform(scale, 0, 0, scale, offset.x, offset.y);
      drawShape(ovCtx, tool, startPos.current, pos, color, brushSize);
      return;
    }

    // Freehand / eraser
    const ctx = getCtx();
    const strokeSegment = { tool, color, brushSize, from: lastPos.current, to: pos };
    applyStrokeSegment(ctx, strokeSegment);
    
    // Add to current stroke
    const currentStroke = strokesRef.current[strokesRef.current.length - 1];
    if (currentStroke && currentStroke.type === 'freehand') {
      currentStroke.points.push(pos);
    }
    
    socket?.emit('draw', { roomId, stroke: strokeSegment });
    lastPos.current = pos;
  }, [tool, color, brushSize, roomId, socket, applyStrokeSegment, drawShape, animateLaser, scale, offset]);

  const endDraw = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false;
      return;
    }
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (tool === 'laser') {
      // Keep animating until trail fades
      setTimeout(() => {
        laserTrail.current = [];
        const ovCtx = getOverlayCtx();
        if (ovCtx && overlayRef.current) {
          ovCtx.setTransform(1, 0, 0, 1, 0, 0);
          ovCtx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
        }
      }, 800);
      return;
    }

    if (isShapeTool(tool)) {
      // Commit shape to main canvas
      const ovCtx = getOverlayCtx();
      const overlay = overlayRef.current;
      if (ovCtx) {
        ovCtx.setTransform(1, 0, 0, 1, 0, 0);
        ovCtx.clearRect(0, 0, overlay.width, overlay.height);
      }
      const ctx = getCtx();
      const from = startPos.current;
      const to = lastPos.current;
      if (from && to) {
        ctx.setTransform(scale, 0, 0, scale, offset.x, offset.y);
        drawShape(ctx, tool, from, to, color, brushSize);
        const shapeData = { tool, color, brushSize, from, to, type: 'shape' };
        // Clear redo stack when drawing something new
        redoStackRef.current = [];
        strokesRef.current.push(shapeData);
        socket?.emit('draw', { roomId, stroke: shapeData });
      }
    }

    startPos.current = null;
    lastPos.current = null;
    syncState();
  }, [tool, color, brushSize, roomId, socket, syncState, drawShape, scale, offset]);

  // ── Track mouse move for cursor even when not drawing (for shapes) ──
  const handleMouseMove = useCallback((e) => {
    if (isDrawing.current && tool !== 'text') {
      draw(e);
    }
    // Update last known pos
    if (isDrawing.current) {
      lastPos.current = getPos(e);
    }
  }, [draw, tool]);

  // ── Hit-test: find a text stroke at a given world position ─────
  const findTextStrokeAt = (pos) => {
    // Search in reverse so topmost text is found first
    for (let i = strokesRef.current.length - 1; i >= 0; i--) {
      const stroke = strokesRef.current[i];
      if (stroke.type !== 'text') continue;
      
      const fontSize = Math.max(16, stroke.brushSize * 2);
      const lines = stroke.text.split('\n');
      const lineHeight = fontSize * 1.3;
      const textHeight = lines.length * lineHeight;
      // Estimate width based on longest line (rough: ~0.6 * fontSize per char)
      const textWidth = Math.max(...lines.map(l => l.length)) * fontSize * 0.6 + 20;
      
      const x1 = stroke.pos.x;
      const y1 = stroke.pos.y;
      const x2 = x1 + textWidth;
      const y2 = y1 + textHeight;
      
      if (pos.x >= x1 - 10 && pos.x <= x2 + 10 && pos.y >= y1 - 10 && pos.y <= y2 + 10) {
        return i;
      }
    }
    return -1;
  };

  // ── Text input creation (draggable + resizable) ────────────────
  const createTextInput = (initialPos, existingText = '', existingColor = null, existingBrushSize = null) => {
    const container = canvasRef.current?.parentElement;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const useColor = existingColor || color;
    const useBrushSize = existingBrushSize || brushSize;

    // Convert world coordinates to screen coordinates for DOM positioning
    const screenX = initialPos.x * scale + offset.x;
    const screenY = initialPos.y * scale + offset.y;

    // Wrapper for drag + resize
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-text-wrapper';
    wrapper.style.position = 'absolute';
    wrapper.style.left = `${screenX}px`;
    wrapper.style.top = `${screenY}px`;
    wrapper.style.zIndex = '10';

    // Stop canvas events from interfering with the text box
    wrapper.addEventListener('mousedown', (e) => e.stopPropagation());
    wrapper.addEventListener('mouseup', (e) => e.stopPropagation());
    wrapper.addEventListener('touchstart', (e) => e.stopPropagation());

    // Drag handle
    const handle = document.createElement('div');
    handle.className = 'canvas-text-handle';
    handle.innerHTML = '<span class="icon" style="font-size:14px">drag_indicator</span>';
    wrapper.appendChild(handle);

    // Textarea
    const input = document.createElement('textarea');
    input.className = 'canvas-text-input';
    input.style.color = useColor;
    input.style.fontSize = `${Math.max(16, useBrushSize * 2)}px`;
    input.style.fontFamily = "'DM Sans', sans-serif";
    input.value = existingText; // Pre-fill with existing text if editing
    wrapper.appendChild(input);

    container.appendChild(wrapper);

    // Delay focus so the current mousedown/mouseup cycle completes first
    requestAnimationFrame(() => {
      input.focus();
    });

    // Dragging
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStart = { x: e.clientX - wrapper.offsetLeft, y: e.clientY - wrapper.offsetTop };
      e.preventDefault();
    });
    const onMouseMove = (e) => {
      if (!isDragging) return;
      wrapper.style.left = `${e.clientX - dragStart.x}px`;
      wrapper.style.top = `${e.clientY - dragStart.y}px`;
    };
    const onMouseUp = () => { isDragging = false; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    let committed = false;
    const commitText = () => {
      if (committed) return; // Prevent double-commit
      committed = true;

      const text = input.value.trim();
      const finalScreenPos = { x: wrapper.offsetLeft, y: wrapper.offsetTop + handle.offsetHeight };
      // Map screen pos back to world pos
      const finalPos = {
        x: (finalScreenPos.x - offset.x) / scale,
        y: (finalScreenPos.y - offset.y) / scale
      };
      
      if (text) {
        const textData = { tool: 'text', color: useColor, brushSize: useBrushSize, pos: finalPos, text, type: 'text' };
        redoStackRef.current = [];
        strokesRef.current.push(textData);
        redraw();
        socket?.emit('draw', {
          roomId,
          stroke: textData
        });
        syncState();
      }
      cleanup();
      wrapper.remove();
    };

    // Delay attaching blur listener so the initial click cycle doesn't trigger it
    setTimeout(() => {
      input.addEventListener('blur', () => setTimeout(commitText, 150));
    }, 300);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { committed = true; input.value = ''; cleanup(); wrapper.remove(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
    });
  };

  // ── Receive remote draw events ─────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const ctx = getCtx();

    socket.on('draw', (data) => {
      const stroke = data;
      if (stroke.tool === 'laser') {
        // Animate remote laser
        if (stroke.points) {
          stroke.points.forEach(p => {
            laserTrail.current.push({ ...p, t: Date.now() });
          });
          cancelAnimationFrame(laserAnimFrame.current);
          laserAnimFrame.current = requestAnimationFrame(animateLaser);
          setTimeout(() => {
            laserTrail.current = [];
            const ovCtx = getOverlayCtx();
            if (ovCtx && overlayRef.current) ovCtx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
          }, 800);
        }
        return;
      }
      if (stroke.type === 'shape' || stroke.type === 'text') {
        strokesRef.current.push(stroke);
        redraw();
        return;
      }
      
      // Merge freehand line segments received individually into one stroke if possible
      const lastStroke = strokesRef.current[strokesRef.current.length - 1];
      if (lastStroke && lastStroke.type === 'freehand' && lastStroke.tool === stroke.tool && lastStroke.color === stroke.color && lastStroke.brushSize === stroke.brushSize) {
        lastStroke.points.push(stroke.to);
      } else {
        strokesRef.current.push({
          type: 'freehand',
          tool: stroke.tool,
          color: stroke.color,
          brushSize: stroke.brushSize,
          points: [stroke.from, stroke.to]
        });
      }
      applyStrokeSegment(ctx, stroke);
    });
    socket.on('undo', () => {
      if (strokesRef.current.length > 0) {
        const removed = strokesRef.current.pop();
        redoStackRef.current.push(removed);
      }
      redraw();
    });
    socket.on('redo', () => {
      if (redoStackRef.current.length > 0) {
        const restored = redoStackRef.current.pop();
        strokesRef.current.push(restored);
      }
      redraw();
    });
    socket.on('clear-board', () => {
      strokesRef.current = [];
      redoStackRef.current = [];
      redraw();
    });
    socket.on('stroke-remove', ({ index }) => {
      if (index >= 0 && index < strokesRef.current.length) {
        strokesRef.current.splice(index, 1);
        redraw();
      }
    });

    return () => {
      socket.off('draw');
      socket.off('undo');
      socket.off('redo');
      socket.off('clear-board');
      socket.off('stroke-remove');
    };
  }, [socket, applyStrokeSegment, redraw, drawShape, syncState, animateLaser]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(laserAnimFrame.current);
  }, []);

  // ── Cursor helper ──────────────────────────────────────────────
  const getCursor = () => {
    switch (tool) {
      case 'eraser': return 'cell';
      case 'text': return 'text';
      case 'laser': return 'none';
      case 'blocked': return 'not-allowed';
      default: return 'crosshair';
    }
  };

  return (
    <div 
      className="canvas-container" 
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {/* Main drawing canvas */}
      <canvas
        id="main-canvas"
        ref={canvasRef}
        className="whiteboard-canvas"
        style={{
          cursor: getCursor(),
          background: bgColor || 'transparent',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
        onMouseDown={startDraw}
        onMouseMove={handleMouseMove}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={handleMouseMove}
        onTouchEnd={endDraw}
      />
      {/* Overlay canvas for shape preview + laser */}
      <canvas
        ref={overlayRef}
        className="whiteboard-canvas"
        style={{
          cursor: getCursor(),
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 2,
        }}
      />
      {/* Laser dot cursor */}
      {tool === 'laser' && (
        <div className="laser-cursor" />
      )}
    </div>
  );
});

export default Canvas;
