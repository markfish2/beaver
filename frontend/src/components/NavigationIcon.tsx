import type { SVGProps } from 'react';

export type NavigationIconType = 'search' | 'memo' | 'diary' | 'project' | 'files' | 'recent' | 'starred' | 'ai' | 'sun' | 'moon' | 'add' | 'todo';

interface NavigationIconProps extends SVGProps<SVGSVGElement> {
  type: NavigationIconType;
}

export default function NavigationIcon({ type, className = '', ...props }: NavigationIconProps) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {type === 'search' && <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4.5 4.5" /></>}
      {type === 'memo' && <><path d="M5 5.5h14v11H9l-4 3z" fill="currentColor" opacity=".12" /><path d="M5 5.5h14v11H9l-4 3zM8.5 9.5h7M8.5 12.5h4" /></>}
      {type === 'diary' && <><rect x="4" y="5" width="16" height="15" rx="2" fill="currentColor" opacity=".12" /><path d="M7 3.5v3M17 3.5v3M4 9h16M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" /><path d="M8.5 13h.1M11.5 13h.1M14.5 13h.1" strokeWidth="2.4" /></>}
      {type === 'project' && <><rect x="4" y="5" width="16" height="15" rx="2" fill="currentColor" opacity=".12" /><path d="M4 9h16M8 5v15M13 9v11M4 5h16v15H4z" /><path d="M9.5 7h1M14.5 7h1" /></>}
      {type === 'files' && <><path d="M4 6.5h6l1.5 2H20v10H4z" fill="currentColor" opacity=".12" /><path d="M4 6.5h6l1.5 2H20v10H4zM4 10h16" /></>}
      {type === 'recent' && <><circle cx="12" cy="12" r="8" fill="currentColor" opacity=".08" /><circle cx="12" cy="12" r="8" /><path d="M12 7.5v5l3 1.8" /></>}
      {type === 'starred' && <><path d="m12 3.8 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" fill="currentColor" opacity=".12" /><path d="m12 3.8 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" /></>}
      {type === 'ai' && <><path d="m12 3.5 1.9 6.6 6.6 1.9-6.6 1.9-1.9 6.6-1.9-6.6-6.6-1.9 6.6-1.9z" fill="currentColor" opacity=".12" /><path d="m12 3.5 1.9 6.6 6.6 1.9-6.6 1.9-1.9 6.6-1.9-6.6-6.6-1.9 6.6-1.9z" /></>}
      {type === 'sun' && <><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>}
      {type === 'moon' && <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.7 7.7 0 1 0 10 10z" fill="currentColor" opacity=".68" />}
      {type === 'add' && <><path d="M12 5v14M5 12h14" /></>}
      {type === 'todo' && <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="m8.5 12 2 2 5-5" /></>}
    </svg>
  );
}
