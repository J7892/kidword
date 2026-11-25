import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  HelpCircle,
  Lightbulb,
  Mic,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { ClickedSpellError } from '../extensions/SpellCheck';

interface SpellingDetectivePopoverProps {
  error: ClickedSpellError | null;
  allowPeek: boolean;
  onClose: () => void;
  onAddPersonalWord: (word: string) => void;
  onRequestPhoneticLookup: (word: string, exclude?: string) => Promise<string[]>;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
}

type TypedLetterStatus = 'correct' | 'present' | 'absent';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

/**
 * Standard two-pass Wordle evaluation of the child's typed letters against the target word:
 * - 'correct' (green): exact letter in the exact position
 * - 'present' (amber/yellow): right letter in the word, wrong position (respecting duplicate counts)
 * - 'absent' (rose): letter not needed
 */
function evaluateTypedLetters(
  typed: string,
  target: string
): Array<{ char: string; status: TypedLetterStatus }> {
  const typedChars = typed.split('');
  const targetChars = target.split('');
  const statuses: TypedLetterStatus[] = new Array(typedChars.length).fill('absent');
  const remainingCounts = new Map<string, number>();

  for (const ch of targetChars) {
    const lower = ch.toLowerCase();
    remainingCounts.set(lower, (remainingCounts.get(lower) ?? 0) + 1);
  }

  // Pass 1: exact-position green matches
  for (let i = 0; i < typedChars.length; i++) {
    if (i < targetChars.length && typedChars[i].toLowerCase() === targetChars[i].toLowerCase()) {
      statuses[i] = 'correct';
      const lower = typedChars[i].toLowerCase();
      remainingCounts.set(lower, (remainingCounts.get(lower) ?? 1) - 1);
    }
  }

  // Pass 2: misplaced yellow matches
  for (let i = 0; i < typedChars.length; i++) {
    if (statuses[i] === 'correct') continue;
    const lower = typedChars[i].toLowerCase();
    const available = remainingCounts.get(lower) ?? 0;
    if (available > 0) {
      statuses[i] = 'present';
      remainingCounts.set(lower, available - 1);
    }
  }

  return typedChars.map((char, idx) => ({ char, status: statuses[idx] }));
}

export function SpellingDetectivePopover({
  error,
  allowPeek,
  onClose,
  onAddPersonalWord,
  onRequestPhoneticLookup,
}: SpellingDetectivePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [lockedTarget, setLockedTarget] = useState<string | null>(null);
  const [audioCandidates, setAudioCandidates] = useState<string[]>([]);
  const [showNotRightMenu, setShowNotRightMenu] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [step2Unlocked, setStep2Unlocked] = useState(false);
  const [peekSecondsLeft, setPeekSecondsLeft] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Track online/offline status for voice fallback visibility
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Reset hint state only when a different misspelled word is clicked (by id)
  useEffect(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setVoiceError('');
    setStep2Unlocked(false);
    setPeekSecondsLeft(null);
    setShowNotRightMenu(false);
    setIsLookingUp(false);

    if (!error) {
      setLockedTarget(null);
      setAudioCandidates([]);
      return;
    }

    if (error.phoneticCandidates.length >= 2) {
      setLockedTarget(null);
      setAudioCandidates(error.phoneticCandidates.slice(0, 3));
    } else {
      setLockedTarget(error.suggestion ?? error.phoneticCandidates[0] ?? null);
      setAudioCandidates([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error?.id]);

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
        const targetEl = e.target as HTMLElement | null;
        // Keep the card open while clicking inside the editor or title to type the fix
        if (!targetEl?.closest?.('.spell-error') && !targetEl?.closest?.('.ProseMirror')) {
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
    const cardWidth = 352;
    const margin = 12;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;

    const left = Math.max(margin, Math.min(error.rect.left, viewportW - cardWidth - margin));
    const showAbove = error.rect.bottom + 360 > viewportH && error.rect.top > 360;
    const top = showAbove ? Math.max(margin, error.rect.top - 348) : error.rect.bottom + 10;

    return { left: `${left}px`, top: `${top}px`, width: `${cardWidth}px` };
  }, [error]);

  const typed = error?.word ?? '';
  const target = lockedTarget;
  const isPeeking = peekSecondsLeft !== null && peekSecondsLeft > 0;
  const isSolved = Boolean(
    target && typed.trim().length > 0 && typed.trim().toLowerCase() === target.toLowerCase()
  );

  // Auto-close briefly after the child finishes spelling the word right
  useEffect(() => {
    if (!isSolved) return;
    const timer = window.setTimeout(() => {
      onClose();
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [isSolved, onClose]);

  const typedTiles = useMemo(() => {
    if (!target || !typed) return [];
    return evaluateTypedLetters(typed, target);
  }, [typed, target]);

  const tiles = useMemo(() => {
    if (!target) return [];

    // First pass: letters the child already matched in the right position + first letter
    const revealed = target.split('').map((char, idx) => {
      const typedChar = typed[idx];
      const isMatched =
        typedChar !== undefined && typedChar.toLowerCase() === char.toLowerCase();
      return {
        char,
        isMatched,
        isRevealed: isPeeking || idx === 0 || isMatched,
      };
    });

    const countBlanks = () => revealed.filter((t) => !t.isRevealed).length;

    // Reveal the last letter in Step 1 only if at least 2 blanks remain,
    // so we never give away the entire word in Step 1.
    const lastIdx = target.length - 1;
    if (lastIdx > 0 && !revealed[lastIdx].isRevealed && countBlanks() >= 2) {
      revealed[lastIdx].isRevealed = true;
    }

    // Step 2: reveal vowels / middle tricky letters while keeping at least 1 blank
    // (the full word is reserved for Step 3: 3-Second Peek).
    if (step2Unlocked && !isPeeking) {
      for (let idx = 1; idx < target.length - 1; idx++) {
        if (countBlanks() <= 1) break;
        const ch = target[idx].toLowerCase();
        const isMiddle =
          idx === Math.floor(target.length / 2) ||
          idx === Math.floor((target.length - 1) / 2);
        if (!revealed[idx].isRevealed && (VOWELS.has(ch) || isMiddle)) {
          revealed[idx].isRevealed = true;
        }
      }
    }

    return revealed;
  }, [target, typed, isPeeking, step2Unlocked]);

  if (!error) return null;

  const isAudioPickerActive = !target && audioCandidates.length >= 2;

  const speechWin = window as WindowWithSpeechRecognition;
  const SpeechRecognitionCtor =
    typeof window !== 'undefined'
      ? speechWin.SpeechRecognition || speechWin.webkitSpeechRecognition
      : undefined;
  const canUseVoice = Boolean(SpeechRecognitionCtor) && isOnline;

  const speakWord = (wordToSpeak: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(wordToSpeak);
    utterance.lang = 'en-CA';
    utterance.rate = 0.9;
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handleNotRightWord = async () => {
    setShowNotRightMenu(true);
    setIsLookingUp(true);
    try {
      const candidates = await onRequestPhoneticLookup(typed, target ?? undefined);
      setAudioCandidates(candidates);
      if (candidates.length >= 2) {
        setLockedTarget(null);
      } else if (candidates.length === 1) {
        setLockedTarget(candidates[0]);
        setStep2Unlocked(false);
        setPeekSecondsLeft(null);
        setShowNotRightMenu(false);
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleVoiceSayWord = () => {
    if (!SpeechRecognitionCtor || isListening) return;
    setVoiceError('');
    setIsListening(true);

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-CA';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      const firstWord = transcript
        .trim()
        .split(/\s+/)[0]
        ?.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ'-]/g, '');

      setIsListening(false);
      if (firstWord && firstWord.length >= 2) {
        setLockedTarget(firstWord);
        setAudioCandidates([]);
        setShowNotRightMenu(false);
        setStep2Unlocked(false);
        setPeekSecondsLeft(null);
      } else {
        setVoiceError("Didn't catch a word — try again!");
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setVoiceError('Could not hear clearly. Try again!');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceError('Microphone is busy. Try again!');
    }
  };

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

      {/* Wordle-style "You typed" tiles when a target word is active, otherwise badge */}
      {target && typedTiles.length > 0 ? (
        <div className="mt-2.5">
          <p className="mb-1 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
            Your letters:
          </p>
          <div className="flex flex-wrap items-center gap-1" aria-label={`You typed ${typed}`}>
            {typedTiles.map((item, idx) => (
              <span
                key={idx}
                title={
                  item.status === 'correct'
                    ? 'Right letter, right spot!'
                    : item.status === 'present'
                      ? 'In the word, wrong spot!'
                      : 'Not needed in this word'
                }
                className={`inline-flex h-7 min-w-[1.65rem] items-center justify-center rounded-md px-1 text-sm font-bold transition ${
                  item.status === 'correct'
                    ? 'border-2 border-emerald-600 bg-emerald-500 text-white'
                    : item.status === 'present'
                      ? 'border-2 border-dashed border-amber-500 bg-amber-200 text-amber-950'
                      : 'border border-rose-300 bg-rose-50 text-rose-800 line-through decoration-rose-400/75'
                }`}
              >
                {item.char}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>
          You typed:{' '}
          <span className="rounded-md bg-red-100 px-1.5 py-0.5 font-bold text-red-800">
            {typed || '—'}
          </span>
        </p>
      )}

      {isSolved && (
        <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-2 text-center text-sm font-bold text-emerald-900">
          🎉 Awesome! You spelled it right!
        </div>
      )}

      {/* Audio-Only Word Picker (2-3 phonetic candidates) */}
      {isAudioPickerActive ? (
        <div className="mt-3 space-y-2.5">
          <p className="text-sm font-bold">Which word did you mean?</p>
          <div className="space-y-2">
            {audioCandidates.map((cand, idx) => (
              <div
                key={cand}
                style={{
                  backgroundColor: 'var(--control-bg)',
                  borderColor: 'var(--toolbar-border)',
                }}
                className="flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2"
              >
                <button
                  type="button"
                  onClick={() => speakWord(cand)}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-bold hover:bg-black/5"
                >
                  <Volume2 className="h-4 w-4 text-blue-500" aria-hidden="true" />
                  <span>🔊 Word {idx + 1}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLockedTarget(cand);
                    setAudioCandidates([]);
                    setShowNotRightMenu(false);
                    setStep2Unlocked(false);
                    setPeekSecondsLeft(null);
                  }}
                  className="h-8 cursor-pointer rounded-lg bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700"
                >
                  Pick this one
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : target ? (
        /* Normal 3-Step Progressive Hint Card */
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
            Word clue ({target.length} letters):
          </p>
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Word clue">
            {tiles.map((tile, idx) => (
              <span
                key={idx}
                className={`inline-flex h-9 min-w-[2rem] items-center justify-center rounded-lg border-2 px-1.5 text-base font-bold transition ${
                  tile.isMatched
                    ? 'border-emerald-600 bg-emerald-500 text-white'
                    : tile.isRevealed
                      ? 'border-blue-400/60 bg-blue-500/10'
                      : 'border-current/25 bg-transparent'
                }`}
              >
                {tile.isRevealed ? tile.char : '_'}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] font-medium" style={{ color: 'var(--ink-muted)' }}>
            🟩 Right spot • 🟨 Right letter, wrong spot!
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
          {isLookingUp
            ? 'Checking sound-alike words...'
            : "Hmm, I couldn't find a match yet! Try saying the word or add it if it's real."}
        </p>
      )}

      {/* Action Buttons */}
      <div className="mt-3.5 flex flex-col gap-2">
        {target && (
          <>
            <button
              type="button"
              onClick={() => speakWord(target)}
              style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
              className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-black/10 px-3 text-sm font-bold transition hover:opacity-85"
            >
              <Volume2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <span>Hear the word</span>
            </button>

            {!step2Unlocked && !isPeeking && (
              <button
                type="button"
                onClick={() => setStep2Unlocked(true)}
                className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-100 px-3 text-sm font-bold text-amber-950 transition hover:bg-amber-200"
              >
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
                <span>Give me another hint</span>
              </button>
            )}

            {allowPeek && (
              <button
                type="button"
                disabled={isPeeking}
                onClick={() => setPeekSecondsLeft(3)}
                className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-purple-300 bg-purple-100 px-3 text-sm font-bold text-purple-950 transition hover:bg-purple-200 disabled:cursor-default"
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

            {!showNotRightMenu && (
              <button
                type="button"
                onClick={() => void handleNotRightWord()}
                style={{ color: 'var(--ink-muted)' }}
                className="flex cursor-pointer items-center justify-center gap-1 py-1 text-xs font-semibold underline decoration-dotted hover:opacity-80"
              >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Not the right word?</span>
              </button>
            )}
          </>
        )}

        {/* Voice fallback when no match is found OR under "Not the right word?" */}
        {canUseVoice && (!target || showNotRightMenu) && (
          <div>
            <button
              type="button"
              onClick={handleVoiceSayWord}
              disabled={isListening}
              className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-100 px-3 text-sm font-bold text-sky-950 transition hover:bg-sky-200 disabled:opacity-75"
            >
              <Mic className={`h-4 w-4 ${isListening ? 'animate-pulse text-red-500' : ''}`} aria-hidden="true" />
              <span>{isListening ? 'Listening...' : 'Say the word'}</span>
            </button>
            {voiceError && (
              <p className="mt-1 text-center text-[11px] font-semibold text-red-700">
                {voiceError}
              </p>
            )}
          </div>
        )}

        {/* It's a real word! */}
        <button
          type="button"
          onClick={() => {
            onAddPersonalWord(typed);
            onClose();
          }}
          className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-100 px-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span>It&apos;s a real word!</span>
        </button>
      </div>
    </div>
  );
}
