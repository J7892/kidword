import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, Lightbulb, Sparkles, Volume2, X } from 'lucide-react';
import type { ClickedSpellError } from '../extensions/SpellCheck';

interface SpellingDetectivePopoverProps {
  error: ClickedSpellError | null;
  allowPeek: boolean;
  onClose: () => void;
  onAddPersonalWord: (word: string) => void;
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

export function SpellingDetectivePopover({
  error,
  allowPeek,
  onClose,
  onAddPersonalWord,
}: SpellingDetectivePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [step2Unlocked, setStep2Unlocked] = useState(false);
  const [peekSecondsLeft, setPeekSecondsLeft] = useState<number | null>(null);

  // Reset hint state whenever a different word is clicked
  useEffect(() => {
    setStep2Unlocked(false);
    setPeekSecondsLeft(null);
  }, [error?.word, error?.from]);

  // Handle 3-second peek countdown
  useEffect(() => {
    if (peekSecondsLeft === null) return;
    if (peekSecondsLeft <= 0) {
      setPeekSecondsLeft(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setPeekSecondsLeft((prev) => (prev !== null && prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [peekSecondsLeft]);

  // Close on Escape or outside click
  useEffect(() => {
    if (!error) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement | null;
        if (!target?.closest?.('.spell-error')) {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [error, onClose]);

  const positionStyle = useMemo(() => {
    if (!error) return {};
    const cardWidth = 336;
    const margin = 12;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;

    const left = Math.max(
      margin,
      Math.min(error.rect.left, viewportW - cardWidth - margin)
    );
    const showAbove = error.rect.bottom + 270 > viewportH && error.rect.top > 280;
    const top = showAbove ? Math.max(margin, error.rect.top - 265) : error.rect.bottom + 10;

    return { left: `${left}px`, top: `${top}px`, width: `${cardWidth}px` };
  }, [error]);

  if (!error) return null;

  const typed = error.word;
  const target = error.suggestion;
  const isPeeking = peekSecondsLeft !== null && peekSecondsLeft > 0;

  const handleSpeak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(target || typed);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  // Build letter tiles for Step 1 / Step 2 / Step 3 Peek
  const tiles = target
    ? target.split('').map((char, idx) => {
        const isFirstOrLast = idx === 0 || idx === target.length - 1;
        const typedChar = typed[idx];
        const isMatched =
          typedChar !== undefined && typedChar.toLowerCase() === char.toLowerCase();
        const isVowel = VOWELS.has(char.toLowerCase());
        const isMiddle =
          idx === Math.floor(target.length / 2) ||
          idx === Math.floor((target.length - 1) / 2);

        // If step 2 is unlocked, reveal vowels (and middle tricky letter)
        const revealedByStep2 = step2Unlocked && (isVowel || isMiddle);
        const isRevealed = isPeeking || isFirstOrLast || isMatched || revealedByStep2;

        return {
          char,
          isMatched,
          isRevealed,
        };
      })
    : [];

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Spelling Detective hints"
      style={{
        ...positionStyle,
        backgroundColor: 'var(--page-bg)',
        borderColor: 'var(--toolbar-border)',
        color: 'var(--ink)',
      }}
      className="no-print fixed z-50 rounded-2xl border-2 p-4 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">
            🕵️
          </span>
          <h3 className="text-base font-bold">Spelling Detective</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Spelling Detective"
          style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition hover:opacity-80"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Typed word badge */}
      <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>
        You typed:{' '}
        <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 font-bold text-red-600 dark:text-red-400">
          {typed}
        </span>
      </p>

      {/* Step 1: Letter Blanks (Wordle-style green matches + first/last revealed) */}
      {target ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Word clue">
            {tiles.map((tile, idx) => (
              <span
                key={idx}
                className={`inline-flex h-9 min-w-[2rem] items-center justify-center rounded-lg border-2 px-1.5 text-base font-bold transition ${
                  tile.isMatched
                    ? 'border-emerald-600 bg-emerald-500 text-white'
                    : tile.isRevealed
                      ? 'border-blue-400/50 bg-blue-500/10'
                      : 'border-current/20 bg-transparent'
                }`}
              >
                {tile.isRevealed ? tile.char : '_'}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] font-medium" style={{ color: 'var(--ink-muted)' }}>
            Green letters are in the right spot! Fix it by typing on the page.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
          Hmm, I couldn&apos;t find a close match in the dictionary. Check the letters or add it if
          it&apos;s a real word!
        </p>
      )}

      {/* Action Buttons */}
      <div className="mt-3.5 flex flex-col gap-2">
        {/* Hear the word */}
        <button
          type="button"
          onClick={handleSpeak}
          style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
          className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition hover:opacity-85"
        >
          <Volume2 className="h-4 w-4 text-blue-500" aria-hidden="true" />
          <span>🔊 Hear the word</span>
        </button>

        {/* Step 2: Give me another hint */}
        {target && !step2Unlocked && !isPeeking && (
          <button
            type="button"
            onClick={() => setStep2Unlocked(true)}
            className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500/15 px-3 text-sm font-bold text-amber-700 transition hover:bg-amber-500/25 dark:text-amber-300"
          >
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
            <span>Give me another hint</span>
          </button>
        )}

        {/* Step 3: 3-Second Peek (respects allowPeek setting) */}
        {target && allowPeek && (
          <button
            type="button"
            disabled={isPeeking}
            onClick={() => setPeekSecondsLeft(3)}
            className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-purple-500/15 px-3 text-sm font-bold text-purple-700 transition hover:bg-purple-500/25 disabled:cursor-default dark:text-purple-300"
          >
            {isPeeking ? (
              <>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>Peeking... ({peekSecondsLeft}s)</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" aria-hidden="true" />
                <span>3-Second Peek</span>
              </>
            )}
          </button>
        )}

        {/* It's a real word! */}
        <button
          type="button"
          onClick={() => {
            onAddPersonalWord(typed);
            onClose();
          }}
          className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600/15 px-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-600/25 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span>It&apos;s a real word!</span>
        </button>
      </div>
    </div>
  );
}
