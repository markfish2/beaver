import { useRef, useEffect, memo } from 'react';

interface WaveformCanvasProps {
  data: Uint8Array | null;
  width?: number;
  height?: number;
  color?: string;
}

const WaveformCanvas = memo(function WaveformCanvas({
  data,
  width = 200,
  height = 40,
  color = '#ef4444',
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (!data || data.length === 0) {
      // 静音状态：画一条中线
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    const barCount = Math.min(data.length, 64);
    const barWidth = width / barCount;
    const centerY = height / 2;

    ctx.fillStyle = color;
    for (let i = 0; i < barCount; i++) {
      const value = data[i] / 255;
      const barHeight = Math.max(2, value * centerY * 0.9);
      const x = i * barWidth;
      // 上下对称
      ctx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight * 2);
    }
  }, [data, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded"
    />
  );
});

export default WaveformCanvas;
