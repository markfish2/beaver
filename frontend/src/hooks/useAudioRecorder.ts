import { useState, useRef, useCallback, useEffect } from 'react';

export type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing';

const MAX_DURATION = 5 * 60 * 1000; // 5 minutes in ms

function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [analyserData, setAnalyserData] = useState<Uint8Array | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const resolveRef = useRef<((blob: Blob) => void) | null>(null);

  // 更新波形数据
  const updateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    setAnalyserData(new Uint8Array(data));
    animFrameRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  const startRecording = useCallback(async (): Promise<Blob | null> => {
    try {
      setState('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 设置音频分析器（用于波形）
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      return new Promise<Blob>((resolve) => {
        resolveRef.current = resolve;

        recorder.onstop = () => {
          // 停止所有轨道
          stream.getTracks().forEach(t => t.stop());
          cancelAnimationFrame(animFrameRef.current);
          analyserRef.current = null;
          setAnalyserData(null);

          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          setState('processing');
          resolve(blob);
          setState('idle');
        };

        recorder.start(100); // 每100ms收集一次数据
        setState('recording');
        setDuration(0);

        // 计时器
        timerRef.current = setInterval(() => {
          setDuration(prev => prev + 100);
        }, 100);

        // 最大时长自动停止
        maxTimerRef.current = setTimeout(() => {
          stopRecording();
        }, MAX_DURATION);

        // 开始波形更新
        animFrameRef.current = requestAnimationFrame(updateWaveform);
      });
    } catch (err) {
      console.error('Failed to start recording:', err);
      setState('idle');
      return null;
    }
  }, [updateWaveform]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const formatDuration = useCallback((ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, []);

  return {
    state,
    duration,
    durationFormatted: formatDuration(duration),
    analyserData,
    startRecording,
    stopRecording,
    isRecording: state === 'recording',
    isProcessing: state === 'processing',
  };
}
