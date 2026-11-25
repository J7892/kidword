import { useEffect, useRef, useState } from 'react';
import { Dices, RefreshCw, Sparkles, X } from 'lucide-react';

interface StorySparkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertIdea: (promptText: string) => void;
}

const CHARACTERS = [
  'A clumsy penguin',
  'A brave beaver',
  'A sleepy moose',
  'A tiny astronaut',
  'A curious raccoon',
  'A skateboarding squirrel',
  'A singing polar bear',
  'A shy dragon',
  'A detective fox',
  'A pancake-loving robot',
  'A friendly ghost',
  'A hockey-playing otter',
  'A forgetful wizard',
  'A bouncy kangaroo',
  'A polite Sasquatch',
  'A clever crow',
  'A teacup-sized fairy',
  'A space-traveling cat',
  'A mud-loving hippo',
  'A giggling yeti',
  'A pirate puffin',
  'A snowshoe hare',
  'A time-traveling hamster',
  'A whistling walrus',
];

const PLACES = [
  'in a haunted treehouse',
  'at a maple syrup factory',
  'on a snowy mountain',
  'inside a giant library',
  'at a secret tree fort',
  'on a floating island',
  'in an underwater castle',
  'at a midnight bakery',
  'on a Mars playground',
  'in a cozy log cabin',
  'at a glowing ice rink',
  'inside a dinosaur museum',
  'on a runaway school bus',
  'in a candy-cane forest',
  'at a lighthouse by the sea',
  "in a giant's kitchen",
  'at a Northern Lights camp',
  'inside a cloud palace',
  'on a pirate ship',
  'in a bustling toy shop',
  'at a rainy-day arcade',
  'in a hidden crystal cave',
  'on a moonbeam train',
  'at a backyard circus',
];

const PROBLEMS = [
  'has to bake a giant cake',
  'lost their favourite toque',
  'must rescue a missing puppy',
  'forgot how to fly',
  'found a mysterious treasure map',
  'accidentally shrunk the school',
  'needs to catch a runaway snowball',
  'has to win the big talent show',
  'woke up with purple polka dots',
  'must deliver a secret letter',
  'turned everything into jelly',
  'has to build a rocket before bedtime',
  'heard a strange noise in the attic',
  'needs to teach a frog to dance',
  'discovered a talking backpack',
  'must find the last piece of a puzzle',
  'got stuck inside a video game',
  'has to return a baby dragon home',
  'spilled rainbow glitter everywhere',
  'needs to stop a sneeze storm',
  'found a key that opens any door',
  'must cross a river of marshmallows',
  'forgot where they hid the cookies',
  'has to befriend a grumpy troll',
];

function pickRandom(list: string[], exclude?: string): string {
  const pool = exclude ? list.filter((item) => item !== exclude) : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function StorySparkModal({ isOpen, onClose, onInsertIdea }: StorySparkModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [character, setCharacter] = useState(() => pickRandom(CHARACTERS));
  const [place, setPlace] = useState(() => pickRandom(PLACES));
  const [problem, setProblem] = useState(() => pickRandom(PROBLEMS));
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Fallback light-dismiss when closedby="any" is unsupported
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const rollDice = () => {
    if (isRolling) return;
    setIsRolling(true);

    let ticks = 0;
    const interval = window.setInterval(() => {
      ticks += 1;
      setCharacter((prev) => pickRandom(CHARACTERS, prev));
      setPlace((prev) => pickRandom(PLACES, prev));
      setProblem((prev) => pickRandom(PROBLEMS, prev));
      if (ticks >= 5) {
        window.clearInterval(interval);
        setIsRolling(false);
      }
    }, 65);
  };

  const fullPrompt = `${character} ${place} ${problem}.`;

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="story-spark-title"
      onClose={onClose}
      style={{
        backgroundColor: 'var(--page-bg)',
        color: 'var(--ink)',
        borderColor: 'var(--toolbar-border)',
      }}
      className="m-auto w-[92vw] max-w-2xl rounded-3xl border-2 p-6 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/20 text-2xl">
            🎲
          </span>
          <div>
            <h2 id="story-spark-title" className="text-xl font-bold">
              Story Spark Dice
            </h2>
            <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
              Roll the dice to spark a brand new story idea!
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close Story Spark Dice"
          style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition hover:opacity-85"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* 3 Spinning Cards */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <SparkCard
          label="Who?"
          emoji="🐾"
          text={character}
          accent="border-sky-400/50 bg-sky-500/10"
          isRolling={isRolling}
        />
        <SparkCard
          label="Where?"
          emoji="🗺️"
          text={place}
          accent="border-emerald-400/50 bg-emerald-500/10"
          isRolling={isRolling}
        />
        <SparkCard
          label="What happens?"
          emoji="⚡"
          text={problem}
          accent="border-purple-400/50 bg-purple-500/10"
          isRolling={isRolling}
        />
      </div>

      {/* Combined Preview */}
      <div
        className="mt-4 rounded-2xl border px-4 py-3 text-center text-base font-semibold"
        style={{
          backgroundColor: 'var(--control-bg)',
          borderColor: 'var(--toolbar-border)',
        }}
      >
        “{fullPrompt}”
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={rollDice}
          disabled={isRolling}
          style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
          className="flex h-11 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-bold transition hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRolling ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>Roll Again</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onInsertIdea(fullPrompt);
            dialogRef.current?.close();
          }}
          className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span>Use This Story Idea</span>
        </button>
      </div>
    </dialog>
  );
}

interface SparkCardProps {
  label: string;
  emoji: string;
  text: string;
  accent: string;
  isRolling: boolean;
}

function SparkCard({ label, emoji, text, accent, isRolling }: SparkCardProps) {
  return (
    <div
      className={`flex min-h-[124px] flex-col justify-between rounded-2xl border-2 p-4 transition-transform duration-150 ${accent} ${
        isRolling ? 'scale-95 opacity-80' : 'scale-100'
      }`}
    >
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide opacity-75">
        <span>{label}</span>
        <span className="text-base" aria-hidden="true">
          {isRolling ? <Dices className="h-4 w-4 animate-spin" /> : emoji}
        </span>
      </div>
      <p className="mt-2 text-base font-bold leading-snug">{text}</p>
    </div>
  );
}
