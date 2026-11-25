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

export const COLOR_SWATCHES: ColorSwatch[] = [
  { name: 'Ink Black', value: '', preview: '#1F242B' },
  { name: 'Navy Blue', value: '#1D4ED8', preview: '#1D4ED8' },
  { name: 'Forest Green', value: '#15803D', preview: '#15803D' },
  { name: 'Berry Purple', value: '#7E22CE', preview: '#7E22CE' },
  { name: 'Crimson Red', value: '#B91C1C', preview: '#B91C1C' },
  { name: 'Burnt Orange', value: '#C2410C', preview: '#C2410C' },
  { name: 'Teal', value: '#0F766E', preview: '#0F766E' },
  { name: 'Chocolate Brown', value: '#6B3E26', preview: '#6B3E26' },
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

