export type PageTheme = 'warm-paper';

export interface FontOption {
  label: string;
  value: string;
}

export interface ColorSwatch {
  name: string;
  value: string;
  preview: string;
}

export interface TextSizeOption {
  id: 'small' | 'normal' | 'big';
  label: string;
  value: string;
}

export const FONTS: FontOption[] = [
  { label: 'Lexend', value: '"Lexend", sans-serif' },
  { label: 'Nunito', value: '"Nunito", sans-serif' },
  { label: 'Lora', value: '"Lora", serif' },
  { label: 'Patrick Hand', value: '"Patrick Hand", cursive' },
  { label: 'Courier Prime', value: '"Courier Prime", monospace' },
  { label: 'Fredoka', value: '"Fredoka", sans-serif' },
];

export const EXTENDED_COLOR_GRID: ColorSwatch[] = [
  // Row 1: Reds, Pinks & Corals
  { name: 'Maroon', value: '#7F1D1D', preview: '#7F1D1D' },
  { name: 'Crimson Red', value: '#B91C1C', preview: '#B91C1C' },
  { name: 'Cherry Red', value: '#DC2626', preview: '#DC2626' },
  { name: 'Strawberry', value: '#E11D48', preview: '#E11D48' },
  { name: 'Flamingo', value: '#F43F5E', preview: '#F43F5E' },
  { name: 'Hot Pink', value: '#EC4899', preview: '#EC4899' },
  { name: 'Bubblegum', value: '#DB2777', preview: '#DB2777' },
  { name: 'Raspberry', value: '#9D174D', preview: '#9D174D' },

  // Row 2: Oranges, Golds & Greens
  { name: 'Burnt Orange', value: '#C2410C', preview: '#C2410C' },
  { name: 'Tangerine', value: '#EA580C', preview: '#EA580C' },
  { name: 'Sunset Orange', value: '#F97316', preview: '#F97316' },
  { name: 'Amber Gold', value: '#D97706', preview: '#D97706' },
  { name: 'Sunshine Gold', value: '#CA8A04', preview: '#CA8A04' },
  { name: 'Dragon Lime', value: '#65A30D', preview: '#65A30D' },
  { name: 'Grass Green', value: '#16A34A', preview: '#16A34A' },
  { name: 'Forest Green', value: '#15803D', preview: '#15803D' },

  // Row 3: Teals, Blues & Indigos
  { name: 'Pine Green', value: '#14532D', preview: '#14532D' },
  { name: 'Emerald Mint', value: '#059669', preview: '#059669' },
  { name: 'Teal', value: '#0F766E', preview: '#0F766E' },
  { name: 'Lagoon', value: '#0891B2', preview: '#0891B2' },
  { name: 'Sky Blue', value: '#0284C7', preview: '#0284C7' },
  { name: 'Ocean Blue', value: '#2563EB', preview: '#2563EB' },
  { name: 'Navy Blue', value: '#1D4ED8', preview: '#1D4ED8' },
  { name: 'Midnight Blue', value: '#1E3A8A', preview: '#1E3A8A' },

  // Row 4: Purples, Browns & Inks
  { name: 'Indigo', value: '#4F46E5', preview: '#4F46E5' },
  { name: 'Electric Violet', value: '#7C3AED', preview: '#7C3AED' },
  { name: 'Berry Purple', value: '#7E22CE', preview: '#7E22CE' },
  { name: 'Plum', value: '#581C87', preview: '#581C87' },
  { name: 'Caramel', value: '#A16207', preview: '#A16207' },
  { name: 'Chocolate Brown', value: '#6B3E26', preview: '#6B3E26' },
  { name: 'Slate Grey', value: '#475569', preview: '#475569' },
  { name: 'Ink Black', value: '', preview: '#1F242B' },
];

export const TEXT_SIZES: TextSizeOption[] = [
  { id: 'small', label: 'Small', value: '15px' },
  { id: 'normal', label: 'Normal', value: '' },
  { id: 'big', label: 'Big', value: '24px' },
];

export const STORY_EMOJIS = [
  '🐉',
  '🚀',
  '🐱',
  '🏰',
  '🌈',
  '⚽',
  '🦕',
  '🎨',
  '🌊',
  '🦋',
  '🤖',
  '📝',
] as const;

export const BOOK_CARD_COLORS = [
  { spine: '#3B82F6', tintLight: '#EFF6FF' },
  { spine: '#10B981', tintLight: '#ECFDF5' },
  { spine: '#8B5CF6', tintLight: '#F5F3FF' },
  { spine: '#F59E0B', tintLight: '#FFFBEB' },
  { spine: '#EC4899', tintLight: '#FDF2F8' },
  { spine: '#06B6D4', tintLight: '#ECFEFF' },
] as const;

