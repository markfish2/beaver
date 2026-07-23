import type { CSSProperties } from 'react';

export interface MemoCardPalette {
  background: string;
  text: string;
  mutedText: string;
  border: string;
  surface: string;
  surfaceStrong: string;
  surfaceBorder: string;
  link: string;
  linkHover: string;
  quoteText: string;
  quoteBorder: string;
  inlineCodeBackground: string;
  inlineCodeText: string;
  isDarkSurface: boolean;
}

export interface MemoColorOption {
  name: string;
  value: string;
  light: MemoCardPalette;
  dark: MemoCardPalette;
}

export const MEMO_TAG_COLORS = [
  { bg: '#eff6ff', text: '#2563eb', border: '#93c5fd', darkBg: '#172554', darkText: '#60a5fa', darkBorder: '#1e40af' },
  { bg: '#f0fdf4', text: '#116329', border: '#86efac', darkBg: '#052e16', darkText: '#4ade80', darkBorder: '#166534' },
  { bg: '#fef3c7', text: '#874d00', border: '#fcd34d', darkBg: '#451a03', darkText: '#fbbf24', darkBorder: '#92400e' },
  { bg: '#fce7f3', text: '#a11658', border: '#f9a8d4', darkBg: '#500724', darkText: '#f472b6', darkBorder: '#9d174d' },
  { bg: '#f3e8ff', text: '#9333ea', border: '#c4b5fd', darkBg: '#2e1065', darkText: '#a78bfa', darkBorder: '#6b21a8' },
  { bg: '#ecfeff', text: '#0e6074', border: '#67e8f9', darkBg: '#083344', darkText: '#22d3ee', darkBorder: '#155e75' },
  { bg: '#fff1f2', text: '#a41132', border: '#fda4af', darkBg: '#4c0519', darkText: '#fb7185', darkBorder: '#9f1239' },
  { bg: '#fdf4ff', text: '#8d1a9b', border: '#e879f9', darkBg: '#4a044e', darkText: '#ef75f7', darkBorder: '#86198f' },
  { bg: '#f0f9ff', text: '#075f8c', border: '#7dd3fc', darkBg: '#082f49', darkText: '#38bdf8', darkBorder: '#075985' },
  { bg: '#fefce8', text: '#735407', border: '#fde047', darkBg: '#422006', darkText: '#facc15', darkBorder: '#a16207' },
] as const;

const lightBase = {
  text: '#27313f',
  mutedText: '#5b6470',
  link: '#174ea6',
  linkHover: '#103b7d',
  quoteText: '#4b5563',
  inlineCodeText: '#3b3520',
  isDarkSurface: false,
} as const;

const darkBase = {
  text: '#f3f4f6',
  mutedText: '#c4c9d1',
  link: '#93c5fd',
  linkHover: '#bfdbfe',
  quoteText: '#d1d5db',
  inlineCodeText: '#f9fafb',
  isDarkSurface: true,
} as const;

export const MEMO_COLOR_OPTIONS: MemoColorOption[] = [
  {
    name: '白',
    value: '#ffffff',
    light: {
      ...lightBase,
      background: '#ffffff',
      border: '#d6d3cc',
      surface: '#f7f6f2',
      surfaceStrong: '#f1f0eb',
      surfaceBorder: '#d6d3cc',
      quoteBorder: '#9ca3af',
      inlineCodeBackground: '#fff3b0',
    },
    dark: {
      ...darkBase,
      background: '#1f2937',
      border: '#4b5563',
      surface: '#172033',
      surfaceStrong: '#111827',
      surfaceBorder: '#4b5563',
      quoteBorder: '#6b7280',
      inlineCodeBackground: '#4a3f1a',
    },
  },
  {
    name: '浅卡片',
    value: '#E5DFD2',
    light: {
      ...lightBase,
      background: '#E5DFD2',
      border: '#bbb3a4',
      surface: '#d9d3c6',
      surfaceStrong: '#cec6b7',
      surfaceBorder: '#b8ae9d',
      quoteBorder: '#817665',
      inlineCodeBackground: '#cec6a6',
    },
    dark: {
      ...darkBase,
      background: '#2a2720',
      border: '#5e5749',
      surface: '#363127',
      surfaceStrong: '#211f1a',
      surfaceBorder: '#655d4d',
      quoteBorder: '#a89d89',
      inlineCodeBackground: '#514827',
    },
  },
  {
    name: '强调黑',
    value: '#1A1A1A',
    light: {
      ...darkBase,
      background: '#1A1A1A',
      border: '#454545',
      surface: '#252525',
      surfaceStrong: '#111111',
      surfaceBorder: '#454545',
      quoteBorder: '#a3a3a3',
      inlineCodeBackground: '#363636',
    },
    dark: {
      ...darkBase,
      background: '#1A1A1A',
      border: '#454545',
      surface: '#252525',
      surfaceStrong: '#101010',
      surfaceBorder: '#454545',
      quoteBorder: '#a3a3a3',
      inlineCodeBackground: '#363636',
    },
  },
  {
    name: '藕粉',
    value: '#b37f90',
    light: {
      ...lightBase,
      text: '#302127',
      mutedText: '#302127',
      background: '#b37f90',
      border: '#8f6070',
      surface: '#c99ead',
      surfaceStrong: '#d8b7c2',
      surfaceBorder: '#8f6070',
      link: '#17233d',
      linkHover: '#10192c',
      quoteText: '#302127',
      quoteBorder: '#704653',
      inlineCodeBackground: '#d7b6c1',
      inlineCodeText: '#302127',
    },
    dark: {
      ...darkBase,
      background: '#70402f',
      border: '#a6654b',
      surface: '#623829',
      surfaceStrong: '#4e2c21',
      surfaceBorder: '#a6654b',
      quoteBorder: '#e0a78f',
      inlineCodeBackground: '#593326',
    },
  },
  {
    name: '雾蓝',
    value: '#d1dfe8',
    light: {
      ...lightBase,
      mutedText: '#56606b',
      background: '#d1dfe8',
      border: '#9fb6c5',
      surface: '#bdcfda',
      surfaceStrong: '#aec4d1',
      surfaceBorder: '#91aab9',
      quoteBorder: '#607d8f',
      inlineCodeBackground: '#b7cbd7',
    },
    dark: {
      ...darkBase,
      background: '#263a43',
      border: '#527281',
      surface: '#304852',
      surfaceStrong: '#1e3038',
      surfaceBorder: '#5d7d8b',
      quoteBorder: '#8fb3c3',
      inlineCodeBackground: '#38525d',
    },
  },
  {
    name: '鼠尾草',
    value: '#9ec8a8',
    light: {
      ...lightBase,
      text: '#203328',
      mutedText: '#34483b',
      background: '#9ec8a8',
      border: '#6fa17a',
      surface: '#b7d8be',
      surfaceStrong: '#c7e1cc',
      surfaceBorder: '#6d9d77',
      link: '#174b55',
      linkHover: '#0f353d',
      quoteText: '#304d38',
      quoteBorder: '#50775a',
      inlineCodeBackground: '#c1ddc7',
      inlineCodeText: '#203328',
    },
    dark: {
      ...darkBase,
      background: '#334b38',
      border: '#62806a',
      surface: '#405c46',
      surfaceStrong: '#293d2e',
      surfaceBorder: '#6f8f77',
      quoteBorder: '#a1c2a8',
      inlineCodeBackground: '#486650',
    },
  },
];

export function getMemoPalette(isDark: boolean, color: string | null | undefined): MemoCardPalette {
  const option = MEMO_COLOR_OPTIONS.find(item => item.value === color) ?? MEMO_COLOR_OPTIONS[0];
  return isDark ? option.dark : option.light;
}

export function getMemoPaletteStyle(palette: MemoCardPalette): CSSProperties {
  return {
    '--memo-bg': palette.background,
    '--memo-text': palette.text,
    '--memo-muted': palette.mutedText,
    '--memo-border': palette.border,
    '--memo-surface': palette.surface,
    '--memo-surface-strong': palette.surfaceStrong,
    '--memo-surface-border': palette.surfaceBorder,
    '--memo-link': palette.link,
    '--memo-link-hover': palette.linkHover,
    '--memo-quote-text': palette.quoteText,
    '--memo-quote-border': palette.quoteBorder,
    '--memo-inline-code-bg': palette.inlineCodeBackground,
    '--memo-inline-code-text': palette.inlineCodeText,
  } as CSSProperties;
}
