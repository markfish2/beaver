export type LineStyleKey = 'curve' | 'straight' | 'direct' | 'dashed' | 'rounded';
export type ColorThemeKey = 'classic' | 'colorful' | 'dark';

export function LineStylePreview({ style, isActive }: { style: LineStyleKey; isActive: boolean }) {
  const stroke = isActive ? '#3B82F6' : '#9CA3AF';
  const wrapper = `w-10 h-6 border-2 rounded flex items-center justify-center ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}`;
  const shapes = {
    curve: <path d="M2,7 Q6,2 12,7 T22,7" fill="none" stroke={stroke} strokeWidth="2" />,
    straight: <polyline points="2,7 10,7 10,3 22,3" fill="none" stroke={stroke} strokeWidth="2" />,
    direct: <line x1="2" y1="7" x2="22" y2="7" stroke={stroke} strokeWidth="2" />,
    dashed: <line x1="2" y1="7" x2="22" y2="7" stroke={stroke} strokeWidth="2" strokeDasharray="4,2" />,
    rounded: <path d="M2,7 L8,7 Q11,7 11,4 L11,3 Q11,1 14,1 L22,1" fill="none" stroke={stroke} strokeWidth="2" />,
  };
  return <div className={wrapper}><svg width="24" height="14" viewBox="0 0 24 14">{shapes[style]}</svg></div>;
}

export function ColorThemePreview({ theme, isActive }: { theme: ColorThemeKey; isActive: boolean }) {
  const colors = { classic: ['bg-slate-600', 'bg-slate-400', 'bg-slate-300'], colorful: ['bg-blue-500', 'bg-green-500', 'bg-amber-500'], dark: ['bg-slate-600', 'bg-slate-500', 'bg-slate-400'] }[theme];
  const background = theme === 'dark' ? 'bg-slate-800' : isActive ? 'bg-blue-50' : 'bg-white';
  return <div className={`w-10 h-6 border-2 rounded flex items-center justify-center gap-0.5 px-1 ${isActive ? 'border-blue-500' : 'border-gray-300'} ${background}`}>
    {colors.map((color, index) => <div key={color} className={`${index === 0 ? 'w-2 h-2' : index === 1 ? 'w-1.5 h-1.5' : 'w-1 h-1'} rounded-full ${color}`} />)}
  </div>;
}
