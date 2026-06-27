import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, X } from 'lucide-react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { uploadAudio } from '../api/data';
import WaveformCanvas from './WaveformCanvas';

type CardState = 'recording' | 'uploading' | 'done';

interface VoiceRecordCardProps {
  onClose: () => void;
  onSaved: (audioUrl: string, durationFormatted: string) => void;
}

export default function VoiceRecordCard({ onClose, onSaved }: VoiceRecordCardProps) {
  const [cardState, setCardState] = useState<CardState>('recording');
  const [error, setError] = useState('');
  const audioBlobRef = useRef<Blob | null>(null);

  const recorder = useAudioRecorder();

  // 自动开始录音
  useEffect(() => {
    let mounted = true;
    recorder.startRecording().then(blob => {
      if (!mounted || !blob) return;
      audioBlobRef.current = blob;
    });
    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 停止录音并上传
  const handleStop = useCallback(async () => {
    recorder.stopRecording();

    // 等待 blob
    const waitForBlob = () => new Promise<Blob | null>(resolve => {
      const check = () => {
        if (audioBlobRef.current) resolve(audioBlobRef.current);
        else setTimeout(check, 50);
      };
      setTimeout(check, 200);
    });

    const blob = await waitForBlob();
    if (!blob || blob.size === 0) {
      setError('录音为空，请重试');
      return;
    }

    setCardState('uploading');
    try {
      const file = new File([blob], 'recording.webm', { type: blob.type });
      const res = await uploadAudio(file);
      const url = res.file_path.replace(/^\/api/, '');
      setCardState('done');
      onSaved(url, recorder.durationFormatted);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '上传失败';
      setError(msg);
    }
  }, [recorder, onSaved, onClose]);

  // 录音中
  if (cardState === 'recording') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={onClose}>
        <div
          className="flex flex-col items-center w-[85vw] max-w-[360px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6"
          onClick={e => e.stopPropagation()}
        >
          <div className="absolute top-3 right-3">
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4 animate-pulse">
            <Mic className="w-10 h-10 text-red-500" />
          </div>

          <div className="text-2xl font-mono text-gray-800 dark:text-gray-200 mb-2">
            {recorder.durationFormatted}
          </div>

          <div className="w-full h-12 mb-6">
            {recorder.analyserData && (
              <WaveformCanvas data={recorder.analyserData} width={280} height={48} />
            )}
          </div>

          <button
            onClick={handleStop}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg"
          >
            <Square className="w-6 h-6 text-white" fill="white" />
          </button>
          <span className="text-xs text-gray-400 mt-2">点击停止录音</span>
        </div>
      </div>
    );
  }

  // 上传中
  if (cardState === 'uploading') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
        <div className="flex flex-col items-center w-[85vw] max-w-[360px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
          <span className="text-sm text-gray-500 dark:text-gray-400">保存录音中...</span>
          {error && (
            <div className="mt-4 text-sm text-red-500 text-center">
              {error}
              <button onClick={onClose} className="block mt-2 text-blue-500 hover:underline">关闭</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
