import { useEffect, useRef } from 'react';

const FOLDER_ICONS = [
  '📁', '📂', '🗂️', '🗃️', '🗄️', '📋', '🏷️', '📰'
];

interface IconPickerProps {
  value?: string;
  onChange: (icon: string) => void;
  onClose: () => void;
}

const IconPicker = ({ value, onChange, onClose }: IconPickerProps) => {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div ref={pickerRef} className="p-2">
      <div className="grid grid-cols-6 gap-1">
        {FOLDER_ICONS.map((icon) => (
          <button
            key={icon}
            onClick={() => onChange(icon)}
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-all ${
              value === icon
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <span className="text-xl">{icon}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default IconPicker;
