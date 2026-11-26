import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  BookOpen,
  Check,
  ChevronDown,
  EyeOff,
  Italic,
  Maximize2,
  Minimize2,
  Plus,
  Redo2,
  Share2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import {
  EXTENDED_COLOR_GRID,
  FONTS,
  TEXT_SIZES,
} from '../constants/editorConfig';

const RAINBOW_WHEEL_BG =
  'conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)';

function normalizeToHex(raw: string): string {
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const toHex = (n: string) =>
      Math.max(0, Math.min(255, Number.parseInt(n, 10)))
        .toString(16)
        .padStart(2, '0');
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }
  return '';
}

function isLightHex(hex: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165;
}

interface ToolbarProps {
  editor: Editor | null;
  defaultFont: string;
  onDefaultFontChange: (font: string) => void;
  onOpenStories: () => void;
  onCreateStory: () => void;
  onOpenStorySpark: () => void;
  onOpenShare: () => void;
  onEnableFocusMode: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function Toolbar({
  editor,
  defaultFont,
  onDefaultFontChange,
  onOpenStories,
  onCreateStory,
  onOpenStorySpark,
  onOpenShare,
  onEnableFocusMode,
  isFullscreen,
  onToggleFullscreen,
}: ToolbarProps) {
  const [isFormatOpen, setIsFormatOpen] = useState(false);
  const [isColorGridOpen, setIsColorGridOpen] = useState(false);
  const [hoveredColorName, setHoveredColorName] = useState<string | null>(null);
  const formatMenuRef = useRef<HTMLDivElement | null>(null);
  const colorGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isFormatOpen && !isColorGridOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (isFormatOpen && formatMenuRef.current && !formatMenuRef.current.contains(target)) {
        setIsFormatOpen(false);
      }
      if (isColorGridOpen && colorGridRef.current && !colorGridRef.current.contains(target)) {
        setIsColorGridOpen(false);
        setHoveredColorName(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFormatOpen(false);
        setIsColorGridOpen(false);
        setHoveredColorName(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFormatOpen, isColorGridOpen]);

  if (!editor) {
    return null;
  }

  const textStyleAttrs = editor.getAttributes('textStyle');
  const rawActiveColor = (textStyleAttrs.color as string | undefined) ?? '';
  const activeColor = rawActiveColor ? normalizeToHex(rawActiveColor) || rawActiveColor : '';
  const activeFontSize = (textStyleAttrs.fontSize as string | undefined) ?? '';
  const activeFontFamily = (textStyleAttrs.fontFamily as string | undefined) || defaultFont;
  const hasCustomColor = activeColor !== '';
  const activeSwatchLabel =
    EXTENDED_COLOR_GRID.find((s) =>
      s.value === ''
        ? activeColor === ''
        : s.value.toLowerCase() === activeColor.toLowerCase()
    )?.name ?? 'Pick a colour';

  const hasActiveFormat =
    editor.isActive('bold') ||
    editor.isActive('italic') ||
    editor.isActive('underline') ||
    activeFontSize !== '';

  const handleFontChange = (fontValue: string) => {
    const { empty } = editor.state.selection;
    if (empty) {
      onDefaultFontChange(fontValue);
      editor.chain().focus().unsetFontFamily().run();
    } else if (fontValue === defaultFont) {
      editor.chain().focus().unsetFontFamily().run();
    } else {
      editor.chain().focus().setFontFamily(fontValue).run();
    }
  };

  const handleSizeChange = (sizeValue: string) => {
    if (!sizeValue) {
      editor.chain().focus().unsetFontSize().run();
    } else {
      editor.chain().focus().setFontSize(sizeValue).run();
    }
  };

  const handleColorChange = (colorValue: string) => {
    if (!colorValue) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(colorValue).run();
    }
  };

  return (
    <header
      className="no-print sticky top-0 z-30 border-b backdrop-blur-md transition-colors duration-200"
      style={{
        backgroundColor: 'var(--toolbar-bg)',
        borderColor: 'var(--toolbar-border)',
      }}
    >
      <div
        role="toolbar"
        aria-label="Writing tools"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-5"
      >
        {/* Left Group: Stories, Undo/Redo, Collapsed Format & Colour */}
        <div className="flex flex-wrap items-center gap-2">
          {/* My Stories Drawer & New Story Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenStories}
              title="Open My Stories library"
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span>My Stories</span>
            </button>

            <button
              type="button"
              onClick={onCreateStory}
              title="Start a new blank story"
              style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition hover:opacity-90"
            >
              <Plus className="h-4 w-4 stroke-[2.75]" aria-hidden="true" />
              <span className="hidden sm:inline">New Story</span>
            </button>
          </div>

          <Divider />

          {/* Undo & Redo */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              aria-label="Undo"
              title="Undo"
              style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition hover:opacity-90 disabled:cursor-default disabled:opacity-35"
            >
              <Undo2 className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              aria-label="Redo"
              title="Redo"
              style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition hover:opacity-90 disabled:cursor-default disabled:opacity-35"
            >
              <Redo2 className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
            </button>
          </div>

          <Divider />

          {/* Single Formatting Popover Button (Font, Size, Bold/Italic/Underline) */}
          <div ref={formatMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsFormatOpen((prev) => !prev);
                setIsColorGridOpen(false);
              }}
              aria-expanded={isFormatOpen}
              title="Text formatting (font, size, bold, italic, underline)"
              style={
                isFormatOpen || hasActiveFormat
                  ? { backgroundColor: 'var(--control-active-bg)', color: 'var(--control-active-text)' }
                  : { backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }
              }
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition hover:opacity-90"
            >
              <Type className="h-4 w-4" aria-hidden="true" />
              <span>Format</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${isFormatOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {isFormatOpen && (
              <div
                role="dialog"
                aria-label="Text formatting options"
                style={{
                  backgroundColor: 'var(--page-bg)',
                  borderColor: 'var(--toolbar-border)',
                  color: 'var(--ink)',
                }}
                className="absolute top-12 left-0 z-50 w-72 space-y-3.5 rounded-2xl border-2 p-4 shadow-2xl"
              >
                {/* Font Family */}
                <div>
                  <label
                    htmlFor="font-family-select"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wide"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    Font
                  </label>
                  <select
                    id="font-family-select"
                    value={activeFontFamily}
                    onChange={(e) => handleFontChange(e.target.value)}
                    style={{
                      fontFamily: activeFontFamily,
                      backgroundColor: 'var(--control-bg)',
                      color: 'var(--ink)',
                    }}
                    className="h-10 w-full cursor-pointer rounded-xl border border-transparent px-3 text-sm font-semibold transition hover:opacity-90"
                  >
                    {FONTS.map((font) => (
                      <option key={font.label} value={font.value} style={{ fontFamily: font.value }}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Text Size */}
                <div>
                  <div
                    className="mb-1.5 text-xs font-bold uppercase tracking-wide"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    Size
                  </div>
                  <div
                    className="grid grid-cols-3 gap-1 rounded-xl p-1"
                    style={{ backgroundColor: 'var(--control-bg)' }}
                  >
                    {TEXT_SIZES.map((size) => {
                      const isActive = activeFontSize === size.value;
                      return (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => handleSizeChange(size.value)}
                          aria-pressed={isActive}
                          style={
                            isActive
                              ? {
                                  backgroundColor: 'var(--control-active-bg)',
                                  color: 'var(--control-active-text)',
                                }
                              : { color: 'var(--ink)' }
                          }
                          className="h-9 cursor-pointer rounded-lg text-sm font-semibold transition hover:opacity-90"
                        >
                          {size.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bold, Italic, Underline */}
                <div>
                  <div
                    className="mb-1.5 text-xs font-bold uppercase tracking-wide"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    Style
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <ToolButton
                      label="Bold"
                      active={editor.isActive('bold')}
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      wide
                    >
                      <Bold className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                      <span className="text-xs font-bold">Bold</span>
                    </ToolButton>
                    <ToolButton
                      label="Italic"
                      active={editor.isActive('italic')}
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      wide
                    >
                      <Italic className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                      <span className="text-xs font-bold">Italic</span>
                    </ToolButton>
                    <ToolButton
                      label="Underline"
                      active={editor.isActive('underline')}
                      onClick={() => editor.chain().focus().toggleUnderline().run()}
                      wide
                    >
                      <UnderlineIcon className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                      <span className="text-xs font-bold">Line</span>
                    </ToolButton>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Expanding Colour Palette Picker */}
          <div ref={colorGridRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsColorGridOpen((prev) => !prev);
                setIsFormatOpen(false);
                setHoveredColorName(null);
              }}
              aria-label="Text colour"
              aria-expanded={isColorGridOpen}
              title={`Text colour (${activeSwatchLabel})`}
              style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold transition hover:opacity-90"
            >
              <span
                style={
                  hasCustomColor
                    ? { backgroundColor: activeColor }
                    : { backgroundImage: RAINBOW_WHEEL_BG }
                }
                className="color-swatch flex h-5 w-5 items-center justify-center rounded-full border border-black/20"
                aria-hidden="true"
              >
                {hasCustomColor && (
                  <Check
                    className={`h-3 w-3 stroke-[3] ${
                      isLightHex(activeColor) ? 'text-slate-900' : 'text-white'
                    }`}
                  />
                )}
              </span>
              <span className="hidden sm:inline">Colour</span>
            </button>

            {isColorGridOpen && (
              <div
                role="dialog"
                aria-label="Choose a text colour"
                style={{
                  backgroundColor: 'var(--page-bg)',
                  borderColor: 'var(--toolbar-border)',
                  color: 'var(--ink)',
                }}
                className="absolute top-12 left-0 z-50 w-76 rounded-2xl border-2 p-3.5 shadow-2xl"
              >
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">
                    🎨 {hoveredColorName || activeSwatchLabel}
                  </span>
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    32 colours
                  </span>
                </div>

                <div className="grid grid-cols-8 gap-2">
                  {EXTENDED_COLOR_GRID.map((swatch) => {
                    const isActive =
                      swatch.value === ''
                        ? activeColor === ''
                        : activeColor.toLowerCase() === swatch.value.toLowerCase();

                    return (
                      <button
                        key={swatch.name}
                        type="button"
                        onClick={() => {
                          handleColorChange(swatch.value);
                          setIsColorGridOpen(false);
                          setHoveredColorName(null);
                        }}
                        onMouseEnter={() => setHoveredColorName(swatch.name)}
                        onMouseLeave={() => setHoveredColorName(null)}
                        onFocus={() => setHoveredColorName(swatch.name)}
                        aria-label={swatch.name}
                        aria-pressed={isActive}
                        title={swatch.name}
                        style={{ backgroundColor: swatch.preview }}
                        className={`color-swatch flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 transition-transform hover:scale-115 ${
                          isActive
                            ? 'scale-110 border-white ring-2 ring-blue-500'
                            : 'border-black/15'
                        }`}
                      >
                        {isActive && (
                          <Check
                            className={`h-3.5 w-3.5 stroke-[3] ${
                              isLightHex(swatch.preview) ? 'text-slate-900' : 'text-white'
                            }`}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Group: Spark, Share, Focus & Fullscreen */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenStorySpark}
            title="Story Spark Dice — roll for a fun story idea"
            style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition hover:opacity-90"
          >
            <span aria-hidden="true">🎲</span>
            <span className="hidden md:inline">Spark</span>
          </button>

          <button
            type="button"
            onClick={onOpenShare}
            title="Share story on WhatsApp"
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Share</span>
          </button>

          <Divider />

          {/* Focus Mode */}
          <button
            type="button"
            onClick={onEnableFocusMode}
            title="Focus Mode — hide tools while writing"
            style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition hover:opacity-90"
          >
            <EyeOff className="h-4 w-4" aria-hidden="true" />
            <span>Focus</span>
          </button>

          {/* Full Screen */}
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-pressed={isFullscreen}
            title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
            style={
              isFullscreen
                ? { backgroundColor: 'var(--control-active-bg)', color: 'var(--control-active-text)' }
                : { backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }
            }
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition hover:opacity-90"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit Full' : 'Full Screen'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Divider() {
  return (
    <div
      className="hidden h-6 w-px sm:block"
      style={{ backgroundColor: 'var(--toolbar-border)' }}
      aria-hidden="true"
    />
  );
}

interface ToolButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  wide?: boolean;
  children: React.ReactNode;
}

function ToolButton({ label, active, onClick, wide = false, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      style={
        active
          ? { backgroundColor: 'var(--control-active-bg)', color: 'var(--control-active-text)' }
          : { backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }
      }
      className={`flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl transition hover:opacity-90 ${
        wide ? 'px-2.5' : 'w-10'
      }`}
    >
      {children}
    </button>
  );
}
