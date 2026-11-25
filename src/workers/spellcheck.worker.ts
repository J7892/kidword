import { doubleMetaphone } from 'double-metaphone';
import nspell, { type NSpellInstance } from 'nspell';

export interface SpellBlockInput {
  pos: number;
  text: string;
}

export interface SpellErrorItem {
  from: number;
  to: number;
  word: string;
  suggestion: string | null;
  phoneticCandidates: string[];
}

export type SpellWorkerRequest =
  | {
      type: 'init';
      baseUrl: string;
      personalWords: string[];
    }
  | {
      type: 'add-word';
      word: string;
    }
  | {
      type: 'check';
      requestId: number;
      blocks: SpellBlockInput[];
      cursorBlockPos?: number;
      cursorOffsetInBlock?: number;
    }
  | {
      type: 'phonetic-lookup';
      requestId: number;
      word: string;
      exclude?: string;
    };

export type SpellWorkerResponse =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'result'; requestId: number; errors: SpellErrorItem[] }
  | { type: 'phonetic-result'; requestId: number; candidates: string[] };

let spell: NSpellInstance | null = null;
const phoneticIndex = new Map<string, string[]>();
const WORD_REGEX = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

function indexPhoneticWord(word: string) {
  if (word.length < 2 || word.length > 18 || !/^[a-zA-Z]+$/.test(word)) return;
  if (/^[A-Z]+$/.test(word)) return;

  const [p1, p2] = doubleMetaphone(word);
  if (p1) {
    const bucket = phoneticIndex.get(p1);
    if (bucket) {
      bucket.push(word);
    } else {
      phoneticIndex.set(p1, [word]);
    }
  }
  if (p2 && p2 !== p1) {
    const bucket = phoneticIndex.get(p2);
    if (bucket) {
      bucket.push(word);
    } else {
      phoneticIndex.set(p2, [word]);
    }
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[n];
}

function findPhoneticCandidates(word: string, exclude?: string, limit = 3): string[] {
  const clean = word.replace(/[^a-zA-Z]/g, '');
  if (!clean) return [];

  const [p1, p2] = doubleMetaphone(clean);
  const pool = new Set<string>();

  if (p1) {
    for (const w of phoneticIndex.get(p1) ?? []) pool.add(w);
  }
  if (p2 && p2 !== p1) {
    for (const w of phoneticIndex.get(p2) ?? []) pool.add(w);
  }

  const lowerInput = clean.toLowerCase();
  const lowerExclude = exclude?.toLowerCase();

  const scored: Array<{ word: string; score: number }> = [];
  const seenLower = new Set<string>();

  for (const cand of pool) {
    const lowerCand = cand.toLowerCase();
    if (lowerCand === lowerInput || lowerCand === lowerExclude) continue;
    if (seenLower.has(lowerCand)) continue;
    seenLower.add(lowerCand);

    const dist = levenshtein(lowerInput, lowerCand);
    if (Math.abs(cand.length - clean.length) > 5 && dist > 5) continue;

    let score = dist * 10 + Math.abs(cand.length - clean.length) * 2;
    if (lowerCand[0] === lowerInput[0]) {
      score -= 3;
    }
    if (/^[A-Z]/.test(cand)) {
      score += 2;
    }

    scored.push({ word: cand, score });
  }

  scored.sort((a, b) => a.score - b.score || a.word.length - b.word.length);
  return scored.slice(0, limit).map((item) => item.word);
}

async function initDictionary(baseUrl: string, personalWords: string[]) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const [affRes, dicRes] = await Promise.all([
    fetch(`${normalizedBase}dictionaries/en-ca/index.aff`),
    fetch(`${normalizedBase}dictionaries/en-ca/index.dic`),
  ]);

  if (!affRes.ok || !dicRes.ok) {
    throw new Error('Failed to load Canadian English dictionary files.');
  }

  const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);
  spell = nspell(aff, dic);

  phoneticIndex.clear();
  const lines = dic.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const slashIdx = lines[i].indexOf('/');
    const baseWord = (slashIdx === -1 ? lines[i] : lines[i].slice(0, slashIdx)).trim();
    if (baseWord) {
      indexPhoneticWord(baseWord);
    }
  }

  for (const word of personalWords) {
    const clean = word.trim();
    if (clean) {
      spell.add(clean);
      indexPhoneticWord(clean);
    }
  }
}

function checkBlocks(
  blocks: SpellBlockInput[],
  cursorBlockPos?: number,
  cursorOffsetInBlock?: number
): SpellErrorItem[] {
  if (!spell) return [];

  const errors: SpellErrorItem[] = [];

  for (const block of blocks) {
    WORD_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = WORD_REGEX.exec(block.text)) !== null) {
      const word = match[0];
      const start = match.index;
      const end = start + word.length;

      // Skip single-letter words and short 2-3 letter acronyms (e.g. TV, BC, USA),
      // while still checking 4+ letter ALL-CAPS words in case Caps Lock is left on.
      if (word.length <= 1 || /^[A-Z]{2,3}$/.test(word)) {
        continue;
      }

      if (
        cursorBlockPos === block.pos &&
        cursorOffsetInBlock !== undefined &&
        cursorOffsetInBlock >= start &&
        cursorOffsetInBlock <= end
      ) {
        continue;
      }

      const normalized = word.replaceAll('’', "'");
      const isAllCaps = /^[A-ZÀ-ÖØ-Þ]+$/.test(normalized);
      const lookupWord = isAllCaps ? normalized.toLowerCase() : normalized;

      if (!spell.correct(normalized) && !spell.correct(normalized.toLowerCase())) {
        const suggestions = spell.suggest(lookupWord);
        if (suggestions.length > 0) {
          errors.push({
            from: block.pos + start,
            to: block.pos + end,
            word,
            suggestion: suggestions[0],
            phoneticCandidates: [],
          });
        } else {
          const phonetic = findPhoneticCandidates(lookupWord);
          errors.push({
            from: block.pos + start,
            to: block.pos + end,
            word,
            suggestion: phonetic.length === 1 ? phonetic[0] : null,
            phoneticCandidates: phonetic,
          });
        }
      }
    }
  }

  return errors;
}

self.onmessage = async (event: MessageEvent<SpellWorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    try {
      await initDictionary(msg.baseUrl, msg.personalWords);
      self.postMessage({ type: 'ready' } satisfies SpellWorkerResponse);
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Dictionary init failed',
      } satisfies SpellWorkerResponse);
    }
    return;
  }

  if (msg.type === 'add-word') {
    const clean = msg.word.trim();
    if (spell && clean) {
      spell.add(clean);
      indexPhoneticWord(clean);
    }
    return;
  }

  if (msg.type === 'check') {
    const errors = checkBlocks(msg.blocks, msg.cursorBlockPos, msg.cursorOffsetInBlock);
    self.postMessage({
      type: 'result',
      requestId: msg.requestId,
      errors,
    } satisfies SpellWorkerResponse);
    return;
  }

  if (msg.type === 'phonetic-lookup') {
    const normalized = msg.word.replaceAll('’', "'");
    const phonetic = findPhoneticCandidates(normalized, msg.exclude, 3);
    const merged = [...phonetic];

    if (spell && merged.length < 3) {
      for (const s of spell.suggest(normalized)) {
        if (
          s.toLowerCase() !== msg.exclude?.toLowerCase() &&
          !merged.some((m) => m.toLowerCase() === s.toLowerCase())
        ) {
          merged.push(s);
          if (merged.length >= 3) break;
        }
      }
    }

    self.postMessage({
      type: 'phonetic-result',
      requestId: msg.requestId,
      candidates: merged.slice(0, 3),
    } satisfies SpellWorkerResponse);
  }
};
