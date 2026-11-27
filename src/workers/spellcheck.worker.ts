import { doubleMetaphone } from 'double-metaphone';
import nspell, { type NSpellInstance } from 'nspell';

export type SpellTargetSurface = 'body' | 'title';

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
      surface?: SpellTargetSurface;
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
  | {
      type: 'result';
      requestId: number;
      surface: SpellTargetSurface;
      errors: SpellErrorItem[];
    }
  | { type: 'phonetic-result'; requestId: number; candidates: string[] };

/**
 * Curated phonetic sight-word map for common 2nd/3rd-grade spellings
 * (Canadian English standard: colour, favourite, neighbour, practise, etc.).
 */
const KID_SIGHT_WORDS: Record<string, string[]> = {
  wuz: ['was'],
  woz: ['was'],
  sed: ['said'],
  sead: ['said'],
  siad: ['said'],
  becuz: ['because'],
  bcuz: ['because'],
  cuz: ['because'],
  becuase: ['because'],
  beacuse: ['because'],
  becase: ['because'],
  becos: ['because'],
  nite: ['night'],
  knite: ['knight'],
  kno: ['know'],
  knw: ['know'],
  noo: ['new'],
  knewed: ['knew'],
  rite: ['write'],
  rit: ['write'],
  writting: ['writing'],
  writeing: ['writing'],
  wunt: ['want', 'went'],
  wnt: ['want', 'went'],
  whant: ['want'],
  wat: ['what'],
  wut: ['what'],
  whut: ['what'],
  wen: ['when'],
  whn: ['when'],
  wer: ['were', 'where'],
  wher: ['where'],
  ware: ['where'],
  ther: ['there'],
  thier: ['their'],
  thair: ['their'],
  theyre: ["they're"],
  dont: ["don't"],
  cant: ["can't"],
  wont: ["won't"],
  didnt: ["didn't"],
  wasnt: ["wasn't"],
  isnt: ["isn't"],
  arent: ["aren't"],
  couldnt: ["couldn't"],
  wouldnt: ["wouldn't"],
  shouldnt: ["shouldn't"],
  im: ["I'm"],
  ive: ["I've"],
  id: ["I'd"],
  wud: ['would'],
  wod: ['would'],
  cud: ['could'],
  cood: ['could'],
  shud: ['should'],
  shood: ['should'],
  duz: ['does'],
  dose: ['does'],
  cum: ['come'],
  kum: ['come'],
  sumthing: ['something'],
  somthing: ['something'],
  frend: ['friend'],
  freind: ['friend'],
  frends: ['friends'],
  freinds: ['friends'],
  skool: ['school'],
  scool: ['school'],
  pepul: ['people'],
  peeple: ['people'],
  peopel: ['people'],
  pepole: ['people'],
  littl: ['little'],
  littel: ['little'],
  verry: ['very'],
  realy: ['really'],
  relly: ['really'],
  reely: ['really'],
  probly: ['probably'],
  probaly: ['probably'],
  definitly: ['definitely'],
  definately: ['definitely'],
  awsome: ['awesome'],
  awesum: ['awesome'],
  awsom: ['awesome'],
  favrit: ['favourite'],
  favorit: ['favourite'],
  favorite: ['favourite'],
  color: ['colour'],
  colors: ['colours'],
  neibor: ['neighbour'],
  naybor: ['neighbour'],
  neighbor: ['neighbour'],
  practis: ['practise'],
  laf: ['laugh'],
  laff: ['laugh'],
  enuf: ['enough'],
  enuff: ['enough'],
  tuff: ['tough'],
  ruf: ['rough'],
  thot: ['thought'],
  thaut: ['thought'],
  throo: ['through'],
  thru: ['through'],
  caut: ['caught'],
  baut: ['bought'],
  agian: ['again'],
  agen: ['again'],
  agan: ['again'],
  evry: ['every'],
  evrey: ['every'],
  firts: ['first'],
  frist: ['first'],
  gril: ['girl'],
  gurl: ['girl'],
  fom: ['from'],
  frum: ['from'],
  ofcourse: ['of course'],
  alot: ['a lot'],
  opshinal: ['optional'],
  opshunal: ['optional'],
  speshul: ['special'],
  speshal: ['special'],
  difrent: ['different'],
  diffrent: ['different'],
  beutiful: ['beautiful'],
  bootiful: ['beautiful'],
  butyful: ['beautiful'],
  famly: ['family'],
  animul: ['animal'],
  sudenly: ['suddenly'],
  finly: ['finally'],
  finaly: ['finally'],
  togethr: ['together'],
  exited: ['excited'],
  exsited: ['excited'],
  suprised: ['surprised'],
  iland: ['island'],
  kasel: ['castle'],
  casel: ['castle'],
  dargon: ['dragon'],
  dinisor: ['dinosaur'],
  dinasaur: ['dinosaur'],
  majic: ['magic'],
  magik: ['magic'],
  tresure: ['treasure'],
  trezhur: ['treasure'],
  advenshur: ['adventure'],
  advencher: ['adventure'],
  queschun: ['question'],
  kwestshun: ['question'],
  anser: ['answer'],
  lisn: ['listen'],
  lisen: ['listen'],
  fone: ['phone'],
  foto: ['photo'],
  elefant: ['elephant'],
  dolfin: ['dolphin'],
};

/**
 * Common elementary-grade words given a ranking boost in phonetic lookup
 * so everyday kid vocabulary beats obscure dictionary entries.
 */
const COMMON_KID_WORDS = new Set([
  'about', 'above', 'across', 'adventure', 'after', 'again', 'almost', 'alone', 'along', 'already',
  'always', 'amazing', 'animal', 'another', 'answer', 'around', 'astronaut', 'awesome', 'balloon',
  'basket', 'beautiful', 'became', 'because', 'become', 'before', 'began', 'behind', 'believe',
  'below', 'better', 'between', 'birthday', 'bottom', 'bought', 'branch', 'bridge', 'bright',
  'brother', 'brought', 'bubble', 'building', 'butterfly', 'button', 'cabin', 'camera', 'candle',
  'captain', 'careful', 'carried', 'castle', 'catch', 'caught', 'center', 'centre', 'change',
  'character', 'chicken', 'children', 'chocolate', 'choose', 'circle', 'climb', 'clothes', 'cloudy',
  'colour', 'colours', 'coming', 'cookie', 'corner', 'could', 'country', 'cousin', 'crayon',
  'creature', 'crystal', 'curious', 'danger', 'dangerous', 'daughter', 'decide', 'different',
  'dinosaur', 'giant', 'discover', 'doctor', 'dolphin', 'dragon', 'dream', 'during', 'early',
  'earth', 'easily', 'eight', 'either', 'elephant', 'energy', 'engine', 'enough', 'evening',
  'every', 'everyone', 'everything', 'excited', 'family', 'famous', 'father', 'favourite',
  'feather', 'finally', 'finger', 'finish', 'first', 'flower', 'flying', 'follow', 'forest',
  'forget', 'forgot', 'forward', 'found', 'friend', 'friends', 'friendly', 'frightened', 'funny',
  'future', 'galaxy', 'garden', 'gentle', 'ghost', 'giggle', 'golden', 'grandma', 'grandpa',
  'ground', 'group', 'guess', 'happen', 'happened', 'happy', 'heard', 'heavy', 'helmet', 'helpful',
  'hidden', 'hockey', 'holiday', 'hungry', 'hurry', 'imagine', 'important', 'inside', 'instead',
  'island', 'jacket', 'jungle', 'kitchen', 'kitten', 'knight', 'knock', 'know', 'laugh', 'laughed',
  'leader', 'learn', 'leaves', 'letter', 'library', 'light', 'listen', 'little', 'lonely', 'lovely',
  'machine', 'magic', 'magical', 'market', 'matter', 'middle', 'minute', 'mirror', 'missing',
  'mitten', 'moment', 'monkey', 'monster', 'morning', 'mother', 'mountain', 'museum', 'music',
  'mystery', 'nature', 'naughty', 'neighbour', 'neither', 'never', 'night', 'nobody', 'nothing',
  'notice', 'number', 'ocean', 'often', 'only', 'open', 'optional', 'orange', 'other', 'outside',
  'palace', 'pancake', 'parent', 'party', 'pencil', 'penguin', 'people', 'perhaps', 'person',
  'phone', 'photo', 'picture', 'pirate', 'planet', 'playground', 'please', 'pocket', 'police',
  'polite', 'possible', 'practise', 'present', 'pretty', 'princess', 'problem', 'promise', 'protect',
  'puppy', 'purple', 'puzzle', 'queen', 'question', 'quickly', 'quiet', 'quietly', 'rabbit',
  'rainbow', 'really', 'reason', 'remember', 'rescue', 'return', 'ribbon', 'right', 'river',
  'robot', 'rocket', 'running', 'school', 'science', 'search', 'season', 'second', 'secret',
  'shadow', 'shield', 'shining', 'should', 'shoulder', 'silver', 'simple', 'sister', 'skateboard',
  'sleepy', 'slowly', 'small', 'smile', 'snowball', 'someone', 'something', 'sometimes', 'sound',
  'space', 'special', 'spider', 'splash', 'spring', 'squirrel', 'stairs', 'started', 'station',
  'stomach', 'stopped', 'stories', 'stormy', 'story', 'strange', 'street', 'strong', 'sudden',
  'suddenly', 'summer', 'surprise', 'surprised', 'sweater', 'swimming', 'teacher', 'terrible',
  'thank', 'their', 'there', 'these', 'thing', 'think', 'though', 'thought', 'thousand', 'three',
  'through', 'throw', 'thunder', 'ticket', 'tiny', 'today', 'together', 'tomorrow', 'tonight',
  'touch', 'towel', 'tower', 'train', 'travel', 'treasure', 'treehouse', 'trouble', 'tunnel',
  'turtle', 'twelve', 'twenty', 'umbrella', 'uncle', 'under', 'unicorn', 'until', 'usually',
  'vacation', 'valley', 'village', 'visit', 'voice', 'volcano', 'waiting', 'walked', 'wanted',
  'watch', 'watched', 'water', 'weather', 'weird', 'welcome', 'where', 'which', 'while', 'whisper',
  'whistle', 'white', 'whole', 'window', 'winter', 'wizard', 'woman', 'wonder', 'wonderful',
  'world', 'worry', 'would', 'write', 'writing', 'wrong', 'yellow', 'yesterday', 'young',
]);

let spell: NSpellInstance | null = null;
const phoneticIndex = new Map<string, string[]>();
const WORD_REGEX = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

function normalizePhoneticOnset(lower: string): string {
  if (lower.startsWith('kn') || lower.startsWith('gn') || lower.startsWith('pn')) {
    return lower.slice(1);
  }
  if (lower.startsWith('wr')) return lower.slice(1);
  if (lower.startsWith('wh')) return `w${lower.slice(2)}`;
  if (lower.startsWith('ph')) return `f${lower.slice(2)}`;
  return lower;
}

function matchCapitalization(suggestion: string, originalWord: string): string {
  if (!suggestion || !originalWord) return suggestion;
  if (suggestion === "I'm" || suggestion === "I've" || suggestion === "I'd") return suggestion;

  const isFirstUpper =
    originalWord[0] === originalWord[0].toUpperCase() &&
    originalWord[0] !== originalWord[0].toLowerCase();
  const isRestLower = originalWord.slice(1) === originalWord.slice(1).toLowerCase();

  if (isFirstUpper && isRestLower) {
    return suggestion[0].toUpperCase() + suggestion.slice(1);
  }

  // When the child typed a lowercase (or Caps-Lock) word, don't force-capitalize
  // suggestions like "Love" or "Mark" if the lowercase word ("love", "mark") is valid.
  const suggestionFirstUpper =
    suggestion[0] === suggestion[0].toUpperCase() &&
    suggestion[0] !== suggestion[0].toLowerCase();
  if (suggestionFirstUpper && (!isFirstUpper || !isRestLower)) {
    const lowerSuggestion = suggestion.toLowerCase();
    if (spell?.correct(lowerSuggestion)) {
      return lowerSuggestion;
    }
  }

  return suggestion;
}

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
  const clean = word.replace(/[^a-zA-Z']/g, '');
  if (!clean) return [];

  const lowerInput = clean.toLowerCase();
  const lowerExclude = exclude?.toLowerCase();

  // Seed with sight-word boosts first if present
  const directSight = (KID_SIGHT_WORDS[lowerInput] ?? []).filter(
    (w) => !w.includes(' ') && w.toLowerCase() !== lowerExclude
  );

  const alphaOnly = clean.replace(/[^a-zA-Z]/g, '');
  const [p1, p2] = alphaOnly ? doubleMetaphone(alphaOnly) : ['', ''];
  const pool = new Set<string>();

  if (p1) {
    for (const w of phoneticIndex.get(p1) ?? []) pool.add(w);
  }
  if (p2 && p2 !== p1) {
    for (const w of phoneticIndex.get(p2) ?? []) pool.add(w);
  }

  const onsetInput = normalizePhoneticOnset(lowerInput);
  const scored: Array<{ word: string; score: number }> = [];
  const seenLower = new Set<string>(directSight.map((w) => w.toLowerCase()));

  for (const cand of pool) {
    const lowerCand = cand.toLowerCase();
    if (lowerCand === lowerInput || lowerCand === lowerExclude) continue;
    if (seenLower.has(lowerCand)) continue;
    seenLower.add(lowerCand);

    const dist = levenshtein(lowerInput, lowerCand);
    if (Math.abs(cand.length - clean.length) > 5 && dist > 5) continue;

    let score = dist * 10 + Math.abs(cand.length - clean.length) * 2;
    const onsetCand = normalizePhoneticOnset(lowerCand);
    if (onsetCand[0] === onsetInput[0]) {
      score -= 4;
    }
    if (COMMON_KID_WORDS.has(lowerCand)) {
      score -= 12;
    }
    if (/^[A-Z]/.test(cand)) {
      score += 3;
    }

    scored.push({ word: cand, score });
  }

  scored.sort((a, b) => a.score - b.score || a.word.length - b.word.length);
  return [...directSight, ...scored.map((item) => item.word)].slice(0, limit);
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
      const lower = normalized.toLowerCase();
      const isAllCaps = /^[A-ZÀ-ÖØ-Þ]+$/.test(normalized);
      const lookupWord = isAllCaps ? lower : normalized;

      if (!spell.correct(normalized) && !spell.correct(lower)) {
        // 1. Check kid sight-word boosts first
        const sightBoost = KID_SIGHT_WORDS[lower]?.filter((w) => !w.includes(' '));
        if (sightBoost && sightBoost.length > 0) {
          const formatted = sightBoost.map((s) => matchCapitalization(s, word));
          errors.push({
            from: block.pos + start,
            to: block.pos + end,
            word,
            suggestion: formatted.length === 1 ? formatted[0] : null,
            phoneticCandidates: formatted.length >= 2 ? formatted : [],
          });
          continue;
        }

        // 2. Standard Canadian English nspell suggestions (ranking common kid words & lowercase matches higher)
        const suggestions = spell.suggest(lookupWord);
        if (suggestions.length > 0) {
          const top = suggestions.slice(0, 6);
          const commonMatch = top.find((s) => COMMON_KID_WORDS.has(s.toLowerCase()));
          const lowerMatch =
            normalized === lower
              ? top.find((s) => s[0] === s[0].toLowerCase() || spell!.correct(s.toLowerCase()))
              : undefined;
          const best = commonMatch ?? lowerMatch ?? suggestions[0];
          errors.push({
            from: block.pos + start,
            to: block.pos + end,
            word,
            suggestion: matchCapitalization(best, word),
            phoneticCandidates: [],
          });
        } else {
          // 3. Double Metaphone phonetic fallback
          const phonetic = findPhoneticCandidates(lookupWord).map((s) =>
            matchCapitalization(s, word)
          );
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
      surface: msg.surface ?? 'body',
      errors,
    } satisfies SpellWorkerResponse);
    return;
  }

  if (msg.type === 'phonetic-lookup') {
    const normalized = msg.word.replaceAll('’', "'");
    const isAllCaps = /^[A-ZÀ-ÖØ-Þ]+$/.test(normalized);
    const lookupWord = isAllCaps ? normalized.toLowerCase() : normalized;
    const phonetic = findPhoneticCandidates(lookupWord, msg.exclude, 3);
    const merged = [...phonetic];

    if (spell && merged.length < 3) {
      for (const s of spell.suggest(lookupWord)) {
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
      candidates: merged.slice(0, 3).map((s) => matchCapitalization(s, msg.word)),
    } satisfies SpellWorkerResponse);
  }
};
