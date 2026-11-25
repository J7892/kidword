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
    };

export type SpellWorkerResponse =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'result'; requestId: number; errors: SpellErrorItem[] };

let spell: NSpellInstance | null = null;
const WORD_REGEX = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

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

  for (const word of personalWords) {
    const clean = word.trim();
    if (clean) {
      spell.add(clean);
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

      // Skip single-letter words or all-caps acronyms (e.g., TV, NASA)
      if (word.length <= 1 || /^[A-Z]+$/.test(word)) {
        continue;
      }

      // Do not underline the word currently being typed until space/punctuation follows
      if (
        cursorBlockPos === block.pos &&
        cursorOffsetInBlock !== undefined &&
        cursorOffsetInBlock >= start &&
        cursorOffsetInBlock <= end
      ) {
        continue;
      }

      const normalized = word.replaceAll('’', "'");
      if (!spell.correct(normalized) && !spell.correct(normalized.toLowerCase())) {
        const suggestions = spell.suggest(normalized);
        errors.push({
          from: block.pos + start,
          to: block.pos + end,
          word,
          suggestion: suggestions[0] ?? null,
        });
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
    if (spell && msg.word.trim()) {
      spell.add(msg.word.trim());
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
  }
};
