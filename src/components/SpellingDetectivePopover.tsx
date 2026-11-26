import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  onReplaceWord: (error: ClickedSpellError, replacement: string) => void;
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
type SlotFlashStatus = 'none' | 'present' | 'wrong';

interface WorkbenchSlot {
  targetChar: string;
  value: string;
  locked: boolean;
  flash: SlotFlashStatus;
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const VALID_SLOT_CHAR = /^[a-zA-ZÀ-ÖØ-öø-ÿ'’-]$/;

function normalizeChar(ch: string): string {
  return ch.replace('’', "'").toLowerCase();
}

function formatSlotChar(typedChar: string, targetChar: string): string {
  const norm = typedChar.replace('’', "'");
  if (targetChar === '’' && norm === "'") return '’';
  if (
    targetChar === targetChar.toUpperCase() &&
    targetChar !== targetChar.toLowerCase()
  ) {
    return norm.toUpperCase();
  }
  return norm.toLowerCase();
}

/**
 * Standard two-pass Wordle evaluation of the child's original typed word against the target word.
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
    const lower = normalizeChar(ch);
    remainingCounts.set(lower, (remainingCounts.get(lower) ?? 0) + 1);
  }

  for (let i = 0; i < typedChars.length; i++) {
    if (i < targetChars.length && normalizeChar(typedChars[i]) === normalizeChar(targetChars[i])) {
      statuses[i] = 'correct';
      const lower = normalizeChar(typedChars[i]);
      remainingCounts.set(lower, (remainingCounts.get(lower) ?? 1) - 1);
    }
  }

  for (let i = 0; i < typedChars.length; i++) {
    if (statuses[i] === 'correct') continue;
    const lower = normalizeChar(typedChars[i]);
    const available = remainingCounts.get(lower) ?? 0;
    if (available > 0) {
      statuses[i] = 'present';
      remainingCounts.set(lower, available - 1);
    }
  }

  return typedChars.map((char, idx) => ({ char, status: statuses[idx] }));
}

/**
 * Builds the initial interactive slots for a target word:
 * - Locks only the letters the child already placed in the exact right position
 * - Leaves every wrong or missing letter (including the 1st letter) as a blank to solve
 * - Guarantees at least 1 unlocked blank remains so the word is never auto-solved on open
 */
function buildInitialSlots(typed: string, target: string): WorkbenchSlot[] {
  const slots: WorkbenchSlot[] = target.split('').map((targetChar, idx) => {
    const typedChar = typed[idx];
    const isMatched =
      typedChar !== undefined && normalizeChar(typedChar) === normalizeChar(targetChar);
    return {
      targetChar,
      value: isMatched ? targetChar : '',
      locked: isMatched,
      flash: 'none',
    };
  });

  // Fallback guard so at least 1 blank always remains for the child to type
  if (slots.length > 1 && slots.every((s) => s.locked)) {
    const lastIdx = slots.length - 1;
    slots[lastIdx] = {
      ...slots[lastIdx],
      value: '',
      locked: false,
    };
  }

  return slots;
}

export function SpellingDetectivePopover({
  error,
  allowPeek,
  onClose,
  onReplaceWord,
  onAddPersonalWord,
  onRequestPhoneticLookup,
}: SpellingDetectivePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingAutoFocusRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const solveTimerRef = useRef<number | null>(null);

  const [lockedTarget, setLockedTarget] = useState<string | null>(null);
  const [slots, setSlots] = useState<WorkbenchSlot[]>([]);
  const [yellowClueLetters, setYellowClueLetters] = useState<string[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isSolved, setIsSolved] = useState(false);

  const [audioCandidates, setAudioCandidates] = useState<string[]>([]);
  const [showNotRightMenu, setShowNotRightMenu] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [peekSecondsLeft, setPeekSecondsLeft] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const clearTimers = useCallback(() => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    if (solveTimerRef.current !== null) {
      window.clearTimeout(solveTimerRef.current);
      solveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const focusSlot = useCallback((idx: number) => {
    requestAnimationFrame(() => {
      const el = slotRefs.current[idx];
      if (el && !el.disabled) {
        el.focus();
        el.select();
      }
    });
  }, []);

  const focusFirstEmptySlot = useCallback(
    (currentSlots: WorkbenchSlot[]) => {
      const firstEmpty = currentSlots.findIndex((s) => !s.locked && !s.value);
      const fallbackUnlocked = currentSlots.findIndex((s) => !s.locked);
      const targetIdx = firstEmpty !== -1 ? firstEmpty : fallbackUnlocked;
      if (targetIdx !== -1) {
        focusSlot(targetIdx);
      }
    },
    [focusSlot]
  );

  const initializeWorkbench = useCallback(
    (typedWord: string, nextTarget: string | null) => {
      clearTimers();
      setIsEvaluating(false);
      setIsShaking(false);
      setIsSolved(false);
      setFeedbackMsg('');
      setPeekSecondsLeft(null);

      if (!nextTarget) {
        setLockedTarget(null);
        setSlots([]);
        setYellowClueLetters([]);
        return;
      }

      setLockedTarget(nextTarget);
      slotRefs.current = [];
      const initialSlots = buildInitialSlots(typedWord, nextTarget);
      setSlots(initialSlots);
      pendingAutoFocusRef.current = true;

      // Seed yellow clues from any misplaced letters in the child's original typed word
      const initialEval = evaluateTypedLetters(typedWord, nextTarget);
      const initialYellows = Array.from(
        new Set(
          initialEval
            .filter((item) => item.status === 'present')
            .map((item) => item.char.toLowerCase())
        )
      );
      setYellowClueLetters(initialYellows);
    },
    [clearTimers]
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

  // Reset workbench when a misspelled word is clicked
  useEffect(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setVoiceError('');
    setShowNotRightMenu(false);
    setIsLookingUp(false);

    if (!error) {
      initializeWorkbench('', null);
      setAudioCandidates([]);
      return;
    }

    if (error.phoneticCandidates.length >= 2) {
      initializeWorkbench(error.word, null);
      setAudioCandidates(error.phoneticCandidates.slice(0, 3));
    } else {
      const nextTarget = error.suggestion ?? error.phoneticCandidates[0] ?? null;
      setAudioCandidates([]);
      initializeWorkbench(error.word, nextTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error?.id]);

  // Handle 3-second peek countdown & refocus first empty box when peek finishes
  useEffect(() => {
    if (peekSecondsLeft === null) return;
    if (peekSecondsLeft <= 0) {
      pendingAutoFocusRef.current = true;
      setPeekSecondsLeft(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setPeekSecondsLeft((prev) => {
        if (prev !== null && prev > 1) return prev - 1;
        pendingAutoFocusRef.current = true;
        return null;
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [peekSecondsLeft]);

  const isPeeking = peekSecondsLeft !== null && peekSecondsLeft > 0;

  // Focus the first blank input AFTER the slot inputs have mounted and are enabled
  useEffect(() => {
    if (!pendingAutoFocusRef.current || !lockedTarget || slots.length === 0 || isPeeking) {
      return;
    }

    const firstEmpty = slots.findIndex((s) => !s.locked && !s.value);
    const targetIdx = firstEmpty !== -1 ? firstEmpty : slots.findIndex((s) => !s.locked);
    if (targetIdx === -1) {
      pendingAutoFocusRef.current = false;
      return;
    }

    const applyFocus = () => {
      const el = slotRefs.current[targetIdx];
      if (el && !el.disabled) {
        if (document.activeElement !== el) {
          el.focus();
        }
        if (document.activeElement === el) {
          pendingAutoFocusRef.current = false;
        }
      }
    };

    applyFocus();
    const confirmTimer = window.setTimeout(() => {
      applyFocus();
      pendingAutoFocusRef.current = false;
    }, 35);
    return () => window.clearTimeout(confirmTimer);
  }, [slots, lockedTarget, isPeeking]);

  // Close on Escape or clicking outside the card
  useEffect(() => {
    if (!error) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        const targetEl = e.target as HTMLElement | null;
        if (!targetEl?.closest?.('.spell-error')) {
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

  const [coords, setCoords] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  }>({ left: 12, top: 12, width: 368, maxHeight: 600 });

  useLayoutEffect(() => {
    if (!error) return;

    const updatePosition = () => {
      const margin = 12;
      const gap = 8;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const width = Math.min(368, Math.max(260, viewportW - margin * 2));
      const maxHeight = Math.max(240, viewportH - margin * 2);

      const el = cardRef.current;
      const measuredH = el ? Math.min(el.scrollHeight, maxHeight) : Math.min(440, maxHeight);

      const left = Math.max(margin, Math.min(error.rect.left, viewportW - width - margin));
      const spaceBelow = viewportH - error.rect.bottom - margin - gap;
      const spaceAbove = error.rect.top - margin - gap;

      let top: number;
      if (measuredH <= spaceBelow) {
        top = error.rect.bottom + gap;
      } else if (measuredH <= spaceAbove) {
        top = error.rect.top - measuredH - gap;
      } else {
        // Not enough room strictly below or above: clamp within the viewport
        const preferredTop =
          spaceAbove > spaceBelow
            ? error.rect.top - measuredH - gap
            : error.rect.bottom + gap;
        top = Math.max(margin, Math.min(preferredTop, viewportH - measuredH - margin));
      }

      setCoords({ left, top, width, maxHeight });
    };

    updatePosition();

    const el = cardRef.current;
    const ro =
      el && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updatePosition())
        : null;
    if (el && ro) {
      ro.observe(el);
    }

    window.addEventListener('resize', updatePosition);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [error, lockedTarget, audioCandidates.length, showNotRightMenu, isSolved, feedbackMsg]);

  const typed = error?.word ?? '';
  const target = lockedTarget;

  const typedTiles = useMemo(() => {
    if (!target || !typed) return [];
    return evaluateTypedLetters(typed, target);
  }, [typed, target]);

  const unlockedCount = useMemo(
    () => slots.filter((s) => !s.locked).length,
    [slots]
  );

  const evaluateAttempt = useCallback(
    (candidateSlots: WorkbenchSlot[]) => {
      if (!error || !target) return;

      const allMatch = candidateSlots.every(
        (s) => normalizeChar(s.value) === normalizeChar(s.targetChar)
      );

      if (allMatch) {
        const solvedSlots = candidateSlots.map((s) => ({
          ...s,
          value: s.targetChar,
          locked: true,
          flash: 'none' as const,
        }));
        setSlots(solvedSlots);
        setIsSolved(true);
        setFeedbackMsg('');
        solveTimerRef.current = window.setTimeout(() => {
          onReplaceWord(error, target);
        }, 850);
        return;
      }

      // Partial match: lock newly right letters green, flash misplaced yellow & wrong rose
      const remainingPool = new Map<string, number>();
      const nextSlots: WorkbenchSlot[] = candidateSlots.map((s) => {
        if (s.locked || normalizeChar(s.value) === normalizeChar(s.targetChar)) {
          return {
            ...s,
            value: s.targetChar,
            locked: true,
            flash: 'none',
          };
        }
        const lowerTarget = normalizeChar(s.targetChar);
        remainingPool.set(lowerTarget, (remainingPool.get(lowerTarget) ?? 0) + 1);
        return { ...s };
      });

      const discoveredYellows = new Set<string>();
      for (let i = 0; i < nextSlots.length; i++) {
        if (nextSlots[i].locked) continue;
        const lowerTyped = normalizeChar(nextSlots[i].value);
        const avail = remainingPool.get(lowerTyped) ?? 0;
        if (avail > 0) {
          nextSlots[i].flash = 'present';
          remainingPool.set(lowerTyped, avail - 1);
          discoveredYellows.add(lowerTyped);
        } else {
          nextSlots[i].flash = 'wrong';
        }
      }

      setSlots(nextSlots);
      setYellowClueLetters(Array.from(discoveredYellows));
      setFeedbackMsg(
        discoveredYellows.size > 0
          ? 'Almost! Yellow letters go in a different box.'
          : 'Good try! Fill in the remaining blanks.'
      );
      setIsEvaluating(true);
      setIsShaking(true);

      feedbackTimerRef.current = window.setTimeout(() => {
        setIsShaking(false);
        setIsEvaluating(false);
        setSlots((curr) => {
          const cleared = curr.map((s) =>
            s.locked ? s : { ...s, value: '', flash: 'none' as const }
          );
          focusFirstEmptySlot(cleared);
          return cleared;
        });
      }, 720);
    },
    [error, focusFirstEmptySlot, onReplaceWord, target]
  );

  const handleCharacterEntry = (idx: number, rawChar: string) => {
    if (isSolved || isEvaluating || isPeeking) return;
    if (!VALID_SLOT_CHAR.test(rawChar)) return;

    const slot = slots[idx];
    if (!slot || slot.locked) return;

    const formatted = formatSlotChar(rawChar, slot.targetChar);
    const nextSlots = slots.map((s, i) =>
      i === idx ? { ...s, value: formatted, flash: 'none' as const } : s
    );
    setSlots(nextSlots);
    setFeedbackMsg('');

    const allFilled = nextSlots.every((s) => s.locked || s.value.length > 0);
    if (allFilled) {
      evaluateAttempt(nextSlots);
      return;
    }

    // Advance to the next empty unlocked box (or next unlocked box)
    const nextEmptyAfter = nextSlots.findIndex((s, i) => i > idx && !s.locked && !s.value);
    const nextEmptyAny = nextSlots.findIndex((s) => !s.locked && !s.value);
    const nextUnlockedAfter = nextSlots.findIndex((s, i) => i > idx && !s.locked);
    const dest =
      nextEmptyAfter !== -1
        ? nextEmptyAfter
        : nextEmptyAny !== -1
          ? nextEmptyAny
          : nextUnlockedAfter;
    if (dest !== -1) {
      focusSlot(dest);
    }
  };

  const handleSlotKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSolved || isEvaluating || isPeeking) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (slots.every((s) => s.locked || s.value.length > 0)) {
        evaluateAttempt(slots);
      } else {
        focusFirstEmptySlot(slots);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      for (let i = idx - 1; i >= 0; i--) {
        if (!slots[i].locked) {
          focusSlot(i);
          break;
        }
      }
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      for (let i = idx + 1; i < slots.length; i++) {
        if (!slots[i].locked) {
          focusSlot(i);
          break;
        }
      }
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      setFeedbackMsg('');
      if (slots[idx].value !== '') {
        setSlots((curr) =>
          curr.map((s, i) => (i === idx ? { ...s, value: '', flash: 'none' } : s))
        );
      } else {
        for (let i = idx - 1; i >= 0; i--) {
          if (!slots[i].locked) {
            setSlots((curr) =>
              curr.map((s, j) => (j === i ? { ...s, value: '', flash: 'none' } : s))
            );
            focusSlot(i);
            break;
          }
        }
      }
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      handleCharacterEntry(idx, e.key);
    }
  };

  // Reveal 1 helpful letter per click while keeping at least 1 blank for the child
  const handleRevealOneHint = () => {
    if (isSolved || isEvaluating || isPeeking) return;
    const unlockedIndices = slots
      .map((s, i) => (!s.locked ? i : -1))
      .filter((i) => i !== -1);
    if (unlockedIndices.length < 2) return;

    const vowelIdx = unlockedIndices.find((i) =>
      VOWELS.has(slots[i].targetChar.toLowerCase())
    );
    const pickIdx = vowelIdx ?? unlockedIndices[0];

    const nextSlots = slots.map((s, i) =>
      i === pickIdx
        ? { ...s, value: s.targetChar, locked: true, flash: 'none' as const }
        : s
    );
    setSlots(nextSlots);
    focusFirstEmptySlot(nextSlots);
  };

  if (!error) return null;

  const isAudioPickerActive = !target && audioCandidates.length >= 2;

  const speechWin = window as WindowWithSpeechRecognition;
  const SpeechRecognitionCtor =
    typeof window !== 'undefined'
      ? speechWin.SpeechRecognition || speechWin.webkitSpeechRecognition
      : undefined;
  const canUseVoice = Boolean(SpeechRecognitionCtor) && isOnline;

  const speakWord = (wordToSpeak: string, refocusBoxes = false) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(wordToSpeak);
    utterance.lang = 'en-CA';
    utterance.rate = 0.9;
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    if (refocusBoxes) {
      focusFirstEmptySlot(slots);
    }
  };

  const handleNotRightWord = async () => {
    setShowNotRightMenu(true);
    setIsLookingUp(true);
    try {
      const candidates = await onRequestPhoneticLookup(typed, target ?? undefined);
      setAudioCandidates(candidates);
      if (candidates.length >= 2) {
        initializeWorkbench(typed, null);
      } else if (candidates.length === 1) {
        setShowNotRightMenu(false);
        initializeWorkbench(typed, candidates[0]);
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
        ?.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ'’-]/g, '');

      setIsListening(false);
      if (firstWord && firstWord.length >= 2) {
        setAudioCandidates([]);
        setShowNotRightMenu(false);
        initializeWorkbench(typed, firstWord);
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
      aria-label="Spelling Detective word workbench"
      style={{
        left: `${coords.left}px`,
        top: `${coords.top}px`,
        width: `${coords.width}px`,
        maxHeight: `${coords.maxHeight}px`,
        overflowY: 'auto',
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

      {/* Original word Wordle clue strip */}
      {target && typedTiles.length > 0 ? (
        <div className="mt-2.5">
          <p className="mb-1 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
            You wrote:
          </p>
          <div className="flex flex-wrap items-center gap-1" aria-label={`You wrote ${typed}`}>
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
                className={`inline-flex h-6 min-w-[1.45rem] items-center justify-center rounded-md px-1 text-xs font-bold ${
                  item.status === 'correct'
                    ? 'border border-emerald-600 bg-emerald-500 text-white'
                    : item.status === 'present'
                      ? 'border border-dashed border-amber-500 bg-amber-200 text-amber-950'
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
          You wrote:{' '}
          <span className="rounded-md bg-red-100 px-1.5 py-0.5 font-bold text-red-800">
            {typed || '—'}
          </span>
        </p>
      )}

      {isSolved && (
        <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-2 text-center text-sm font-bold text-emerald-900">
          🎉 You got it! Updating your story...
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
                    setAudioCandidates([]);
                    setShowNotRightMenu(false);
                    initializeWorkbench(typed, cand);
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
        /* Interactive Letter-Box Workbench */
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-bold">
              Fix it here ({target.length} letters):
            </span>
            {yellowClueLetters.length > 0 && !isSolved && (
              <span className="rounded-md border border-dashed border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-950">
                🟨 Use: {yellowClueLetters.join(', ')}
              </span>
            )}
          </div>

          <div
            className={`flex flex-wrap items-center gap-1.5 ${
              isShaking ? 'animate-gentle-shake' : ''
            }`}
            role="group"
            aria-label="Spell the word in the boxes"
          >
            {slots.map((slot, idx) => {
              if (slot.locked) {
                return (
                  <span
                    key={idx}
                    aria-label={`Letter ${idx + 1}: ${slot.value} (locked)`}
                    className="inline-flex h-10 w-9 items-center justify-center rounded-xl border-2 border-emerald-600 bg-emerald-500 text-lg font-bold text-white shadow-xs select-none"
                  >
                    {slot.value}
                  </span>
                );
              }

              const flashClasses =
                slot.flash === 'present'
                  ? 'border-dashed border-amber-500 bg-amber-200 text-amber-950'
                  : slot.flash === 'wrong'
                    ? 'border-rose-400 bg-rose-100 text-rose-900'
                    : 'border-blue-400 bg-white text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30';

              return (
                <div key={idx} className="relative">
                  <input
                    ref={(el) => {
                      slotRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    disabled={isSolved || isEvaluating || isPeeking}
                    value={isPeeking ? '' : slot.value}
                    aria-label={`Letter ${idx + 1} of ${slots.length}`}
                    onKeyDown={(e) => handleSlotKeyDown(idx, e)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const lastChar = raw.slice(-1);
                      if (lastChar) {
                        handleCharacterEntry(idx, lastChar);
                      }
                    }}
                    className={`h-10 w-9 rounded-xl border-2 text-center text-lg font-bold shadow-xs transition focus:outline-none ${flashClasses}`}
                  />
                  {isPeeking && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-bold text-purple-600/75"
                    >
                      {slot.targetChar}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-1.5 text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
            {feedbackMsg || 'Type the missing letters — checks automatically when full!'}
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
      {!isSolved && (
        <div className="mt-3.5 flex flex-col gap-2">
          {target && (
            <>
              <button
                type="button"
                onClick={() => speakWord(target, true)}
                style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
                className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-black/10 px-3 text-sm font-bold transition hover:opacity-85"
              >
                <Volume2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <span>Hear the word</span>
              </button>

              {unlockedCount >= 2 && !isPeeking && (
                <button
                  type="button"
                  onClick={handleRevealOneHint}
                  className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-100 px-3 text-sm font-bold text-amber-950 transition hover:bg-amber-200"
                >
                  <Lightbulb className="h-4 w-4" aria-hidden="true" />
                  <span>Give me a hint (1 letter)</span>
                </button>
              )}

              {allowPeek && unlockedCount >= 1 && (
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
                <Mic
                  className={`h-4 w-4 ${isListening ? 'animate-pulse text-red-500' : ''}`}
                  aria-hidden="true"
                />
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
      )}
    </div>
  );
}
