import type { SVGProps } from 'react';
import type { Document } from '../api/data';

export type DocumentIconType = Document['type'] | 'folder-open' | 'memo' | 'diary' | 'ai' | 'project';

interface DocumentTypeIconProps extends SVGProps<SVGSVGElement> {
  type: DocumentIconType;
}

// Notion-like glyphs: few geometric shapes, one neutral color, no decorative details.
export default function DocumentTypeIcon({ type, className = '', ...props }: DocumentTypeIconProps) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-gray-500 dark:text-gray-400 shrink-0 ${className}`}
      aria-hidden="true"
    >
      {type === 'folder' && <>
        <path d="M2.75 8.623v7.379a4 4 0 0 0 4 4h10.5a4 4 0 0 0 4-4v-5.69a4 4 0 0 0-4-4H12M2.75 8.624V6.998a3 3 0 0 1 3-3h2.9a2.5 2.5 0 0 1 1.768.732L12 6.313m-9.25 2.31h5.904a2.5 2.5 0 0 0 1.768-.732L12 6.313" strokeWidth="1.5" strokeLinejoin="round" />
      </>}
      {type === 'folder-open' && (
        <path
          d="m3.882 18.043l4.041-5.623a4 4 0 0 1 3.249-1.665h8.752M3.882 18.043a3.65 3.65 0 0 0 2.777 1.277h8.343a4 4 0 0 0 3.405-1.9l2.918-4.734a1.287 1.287 0 0 0-1.115-1.931h-.286M3.882 18.043A3.65 3.65 0 0 1 3 15.661V7.424A2.744 2.744 0 0 1 5.744 4.68h2.653c.607 0 1.189.24 1.618.67l.911.91a1.83 1.83 0 0 0 1.294.537l4.044-.001a3.66 3.66 0 0 1 3.66 3.66v.299"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      )}
      {type === 'note' && <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M16.5 4H8a4 4 0 0 0-4 4v8.5a4 4 0 0 0 4 4h6.843a4 4 0 0 0 2.829-1.172l1.656-1.656a4 4 0 0 0 1.172-2.829V8a4 4 0 0 0-4-4" />
        <path d="M20.5 14H17a3 3 0 0 0-3 3v3.5M8 8h7.5M8 12h5" />
      </g>}
      {type === 'document' && <g fill="none">
        <circle cx="7.877" cy="8.25" r="1" fill="currentColor" />
        <path stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" d="M11.062 8.25h5.31" />
        <circle cx="7.877" cy="12" r="1" fill="currentColor" />
        <path stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" d="M11.062 12h5.31" />
        <circle cx="7.877" cy="15.75" r="1" fill="currentColor" />
        <path stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" d="M11.062 15.75h5.31" />
        <rect width="16.5" height="16.5" x="3.75" y="3.75" stroke="currentColor" strokeWidth="1.5" rx="4" />
      </g>}
      {type === 'excalidraw' && <g fill="none">
        <circle cx="1.25" cy="1.25" r="1.25" fill="currentColor" transform="matrix(-1 0 0 1 16.654 6.034)" />
        <circle cx="1.25" cy="1.25" r="1.25" fill="currentColor" transform="matrix(-1 0 0 1 12.156 5.221)" />
        <circle cx="1.25" cy="1.25" r="1.25" fill="currentColor" transform="matrix(-1 0 0 1 8.654 7.94)" />
        <circle cx="1.25" cy="1.25" r="1.25" fill="currentColor" transform="matrix(-1 0 0 1 7.685 12.156)" />
        <circle cx="1.25" cy="1.25" r="1.25" fill="currentColor" transform="matrix(-1 0 0 1 9.904 15.948)" />
        <path stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" d="M21.25 12A9.25 9.25 0 1 0 12 21.25c1.318 0 2.224-1.28 2.329-2.594l.117-1.473a3 3 0 0 1 2.758-2.752l1.651-.129c1.28-.1 2.395-1.019 2.395-2.302Z" />
      </g>}
      {type === 'memo' && <>
        <path d="M5 5.5h14v11H9l-4 3z" fill="currentColor" opacity=".12" />
        <path d="M5 5.5h14v11H9l-4 3zM8.5 9.5h7M8.5 12.5h4" />
      </>}
      {type === 'diary' && <>
        <rect x="4" y="5" width="16" height="15" rx="2" fill="currentColor" opacity=".12" />
        <path d="M7 3.5v3M17 3.5v3M4 9h16M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />
        <path d="M8.5 13h.1M11.5 13h.1M14.5 13h.1" strokeWidth="2.4" />
      </>}
      {type === 'ai' && <>
        <path d="M4 5.5h16v10H9l-5 3z" fill="currentColor" opacity=".12" />
        <path d="M4 5.5h16v10H9l-5 3zM9 10h6M9 13h3" />
      </>}
      {type === 'project' && <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <rect width="3.998" height="15" x="2.75" y="4.504" rx="1.5" />
        <rect width="3.998" height="15" x="9.201" y="4.504" rx="1.5" />
        <path d="M15.267 8.378c-.165-.615.2-1.247.814-1.411l1.038-.278c.614-.165 1.245.2 1.41.814l2.681 10.014a1.15 1.15 0 0 1-.814 1.41l-1.038.279a1.15 1.15 0 0 1-1.41-.815z" />
      </g>}
    </svg>
  );
}
