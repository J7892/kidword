import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  BookOpen,
  Check,
  EyeOff,
  Italic,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Redo2,
  Share2,
  Square,
  Underline as UnderlineIcon,
  Undo2,
  Volume2,
} from 'lucide-react';
import {
  COLOR_SWATCHES,
  EXTENDED_COLOR_GRID,
  FONTS,
  TEXT_SIZES,
} from '../constants/editorConfig';

export type ReadAloudStatus = 'idle' | 'playing' | 'paused';
export type ReadAloudSpeed = 'slow' | 'normal';

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
  readAloudStatus: ReadAloudStatus;
  readAloudSpeed: ReadAloudSpeed;
  onReadPlayPause: () => void;
  onReadStop: () => void;
  onToggleReadSpeed: () => void;
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
  readAloudStatus,
  readAloudSpeed,
  onReadPlayPause,
  onReadStop,
  onToggleReadSpeed,
  onOpenStorySpark,
  onOpenShare,
  onEnableFocusMode,
  isFullscreen,
  onToggleFullscreen,
}: ToolbarProps) {
  const [isColorGridOpen, setIsColorGridOpen] = useState(false);
  const [hoveredColorName, setHoveredColorName] = useState<string | null>(null);
  const colorGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isColorGridOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (colorGridRef.current && !colorGridRef.current.contains(e.target as Node)) {
        setIsColorGridOpen(false);
        setHoveredColorName(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
  }, [isColorGridOpen]);

  if (!editor) {
    return null;
  }

  const textStyleAttrs = editor.getAttributes('textStyle');
  const rawActiveColor = (textStyleAttrs.color as string | undefined) ?? '';
  const activeColor = rawActiveColor ? normalizeToHex(rawActiveColor) || rawActiveColor : '';
  const activeFontSize = (textStyleAttrs.fontSize as string | undefined) ?? '';
  const activeFontFamily = (textStyleAttrs.fontFamily as string | undefined) || defaultFont;
  const isCustomColorActive =
    activeColor !== '' &&
    !COLOR_SWATCHES.some((s) => s.value !== '' && s.value.toLowerCase() === activeColor.toLowerCase());
  const activeSwatchLabel =
    EXTENDED_COLOR_GRID.find((s) =>
      s.value === ''
        ? activeColor === ''
        : s.value.toLowerCase() === activeColor.toLowerCase()
    )?.name ?? 'Pick a colour';

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
        className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-5"
      >
        {/* Left & Center Formatting Groups */}
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

          {/* Font Family Selector */}
          <label className="sr-only" htmlFor="font-family-select">
            Font style
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
            className="h-10 cursor-pointer rounded-xl border border-transparent px-3 text-sm font-semibold transition hover:opacity-90"
            title="Choose a font"
          >
            {FONTS.map((font) => (
              <option key={font.label} value={font.value} style={{ fontFamily: font.value }}>
                {font.label}
              </option>
            ))}
          </select>

          <Divider />

          {/* Text Size Presets */}
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--control-bg)' }}>
            {TEXT_SIZES.map((size) => {
              const isActive = activeFontSize === size.value;
              return (
                <button
                  key={size.id}
                  type="button"
                  onClick={() => handleSizeChange(size.value)}
                  aria-pressed={isActive}
                  title={`Text size: ${size.label}`}
                  style={
                    isActive
                      ? { backgroundColor: 'var(--control-active-bg)', color: 'var(--control-active-text)' }
                      : { color: 'var(--ink)' }
                  }
                  className="h-8 cursor-pointer rounded-lg px-2.5 text-sm font-semibold transition hover:opacity-90"
                >
                  {size.label}
                </button>
              );
            })}
          </div>

          <Divider />

          {/* Bold, Italic, Underline */}
          <div className="flex items-center gap-1">
            <ToolButton
              label="Bold"
              active={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label="Italic"
              active={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label="Underline"
              active={editor.isActive('underline')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
            </ToolButton>
          </div>

          <Divider />

          {/* 8 High-Contrast Color Swatches + Custom Color Picker */}
          <div className="flex items-center gap-1.5" role="group" aria-label="Text colors">
            {COLOR_SWATCHES.map((swatch) => {
              const isActive =
                swatch.value === ''
                  ? activeColor === ''
                  : activeColor.toLowerCase() === swatch.value.toLowerCase();

              return (
                <button
                  key={swatch.name}
                  type="button"
                  onClick={() => handleColorChange(swatch.value)}
                  aria-label={swatch.name}
                  aria-pressed={isActive}
                  title={swatch.name}
                  style={{ backgroundColor: swatch.preview }}
                  className={`color-swatch flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${
                    isActive
                      ? 'scale-110 border-white ring-2 ring-blue-500'
                      : 'border-black/20'
                  }`}
                >
                  {isActive && <Check className="h-3.5 w-3.5 text-white stroke-[3]" aria-hidden="true" />}
                </button>
              );
            })}

            {/* More Colours Crayon Grid Popover */}
            <div ref={colorGridRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsColorGridOpen((prev) => !prev);
                  setHoveredColorName(null);
                }}
                aria-label="More colours"
                aria-expanded={isColorGridOpen}
                title="More colours"
                style={
                  isCustomColorActive
                    ? { backgroundColor: activeColor }
                    : { backgroundImage: RAINBOW_WHEEL_BG }
                }
                className={`color-swatch relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${
                  isCustomColorActive || isColorGridOpen
                    ? 'scale-110 border-white ring-2 ring-blue-500'
                    : 'border-black/20'
                }`}
              >
                {isCustomColorActive ? (
                  <Check
                    className={`pointer-events-none h-3.5 w-3.5 stroke-[3] ${
                      isLightHex(activeColor) ? 'text-slate-900' : 'text-white'
                    }`}
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="pointer-events-none h-2.5 w-2.5 rounded-full bg-white/90 shadow-xs"
                    aria-hidden="true"
                  />
                )}
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
                  className="absolute top-10 left-1/2 z-50 w-76 -translate-x-1/2 rounded-2xl border-2 p-3.5 shadow-2xl sm:left-auto sm:right-0 sm:translate-x-0"
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
        </div>

        {/* Right Group: Read, Spark, Share, Focus & Fullscreen */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Read My Story & Story Spark Dice */}
          <div className="flex items-center gap-1.5">
            {readAloudStatus === 'idle' ? (
              <button
                type="button"
                onClick={onReadPlayPause}
                title="Read My Story aloud"
                style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition hover:opacity-90"
              >
                <Volume2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <span className="hidden md:inline">Read My Story</span>
              </button>
            ) : (
              <div
                className="flex items-center gap-1 rounded-xl p-1"
                style={{ backgroundColor: 'var(--control-bg)' }}
                role="group"
                aria-label="Read aloud controls"
              >
                <button
                  type="button"
                  onClick={onReadPlayPause}
                  aria-label={readAloudStatus === 'playing' ? 'Pause reading' : 'Resume reading'}
                  title={readAloudStatus === 'playing' ? 'Pause' : 'Play'}
                  style={{
                    backgroundColor: 'var(--control-active-bg)',
                    color: 'var(--control-active-text)',
                  }}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition hover:opacity-90"
                >
                  {readAloudStatus === 'playing' ? (
                    <Pause className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onReadStop}
                  aria-label="Stop reading"
                  title="Stop"
                  style={{ color: 'var(--ink)' }}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition hover:bg-black/10"
                >
                  <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onToggleReadSpeed}
                  aria-label={`Reading speed: ${readAloudSpeed}`}
                  title="Switch between Slow and Normal reading speed"
                  style={{ color: 'var(--ink)' }}
                  className="h-8 cursor-pointer rounded-lg px-2 text-xs font-bold transition hover:bg-black/10"
                >
                  {readAloudSpeed === 'slow' ? '🐢 Slow' : '🐇 Normal'}
                </button>
              </div>
            )}

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
          </div>

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
  children: React.ReactNode;
}

function ToolButton({ label, active, onClick, children }: ToolButtonProps) {
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
      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition hover:opacity-90"
    >
      {children}
    </button>
  );
}
