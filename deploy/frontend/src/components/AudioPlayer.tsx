import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  themed?: boolean;
}

export default function AudioPlayer({ src, themed = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setProgress(audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0);
    const onEnded = () => { setPlaying(false); setProgress(0); };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => { audio.removeEventListener('timeupdate', onTimeUpdate); audio.removeEventListener('ended', onEnded); };
  }, [src]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  }, [playing]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
  }, []);

  return (
    <div className="flex items-center gap-1.5 w-full">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={togglePlay}
        className="shrink-0 transition-opacity hover:opacity-75"
        style={themed ? { color: 'var(--memo-link)' } : { color: '#3f587f' }}
      >
        {playing
          ? <Pause className="w-3.5 h-3.5" fill="currentColor" />
          : <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
        }
      </button>
      <div
        className="flex-1 h-[2px] rounded-full bg-gray-200 dark:bg-gray-700 cursor-pointer relative"
        style={themed ? { background: 'var(--memo-surface-border)' } : undefined}
        onClick={handleSeek}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${progress}%`, background: themed ? 'var(--memo-link)' : '#3f587f' }}
        />
      </div>
    </div>
  );
}
