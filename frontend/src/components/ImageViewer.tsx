import { useState, useEffect, useCallback, useRef, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ImageViewerProps {
  src: string;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
}

const ImageViewer = ({ src, alt = '图片', isOpen, onClose }: ImageViewerProps) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);
  const touchDragStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const lastTapRef = useRef(0);

  const resetState = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setScale(prev => Math.min(prev + 0.25, 5));
      } else if (e.key === '-') {
        setScale(prev => Math.max(prev - 0.25, 0.25));
      } else if (e.key === '0') {
        resetState();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, resetState]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.25, Math.min(5, prev + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const touchDistance = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const { touches } = e;
    if (touches.length === 2) {
      pinchStartRef.current = { distance: touchDistance(touches), scale };
      touchDragStartRef.current = null;
      return;
    }
    if (touches.length !== 1) return;

    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      setScale(previous => previous > 1.5 ? 1 : 2.5);
      setPosition({ x: 0, y: 0 });
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    if (scale > 1) {
      touchDragStartRef.current = {
        x: touches[0].clientX,
        y: touches[0].clientY,
        px: position.x,
        py: position.y,
      };
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const { touches } = e;
    if (touches.length === 2 && pinchStartRef.current) {
      const ratio = touchDistance(touches) / pinchStartRef.current.distance;
      setScale(Math.max(0.25, Math.min(5, pinchStartRef.current.scale * ratio)));
      return;
    }
    if (touches.length === 1 && touchDragStartRef.current) {
      const start = touchDragStartRef.current;
      setPosition({
        x: start.px + touches[0].clientX - start.x,
        y: start.py + touches[0].clientY - start.y,
      });
    }
  };

  const handleTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) pinchStartRef.current = null;
    if (e.touches.length === 0) {
      touchDragStartRef.current = null;
      setIsDragging(false);
    }
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 5));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleReset = () => {
    resetState();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] overflow-hidden bg-black/90 flex items-center justify-center animate-in fade-in duration-200"
      style={{ left: 'var(--desktop-overlay-left, 0px)' }}
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        title="关闭 (Esc)"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-full text-white transition-colors"
          title="缩小 (-)"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="text-white text-sm min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-full text-white transition-colors"
          title="放大 (+)"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <div className="w-px h-5 bg-white/30 mx-1" />
        <button
          onClick={handleReset}
          className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-full text-white transition-colors"
          title="重置 (0)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Image */}
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain select-none transition-transform duration-100"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'default'
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        draggable={false}
      />

      {/* Hint */}
      <div className="absolute top-4 left-4 text-white/60 text-sm">
        滚轮缩放 · 拖拽移动 · ESC 关闭
      </div>
    </div>,
    document.body
  );
};

export default ImageViewer;
