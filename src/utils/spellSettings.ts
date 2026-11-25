const PERSONAL_DICT_KEY = 'kidword-personal-dictionary';
const ALLOW_PEEK_KEY = 'kidword-allow-peek';

export function loadPersonalWords(): string[] {
  try {
    const raw = localStorage.getItem(PERSONAL_DICT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((w): w is string => typeof w === 'string' && w.trim().length > 0);
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}

export function addPersonalWord(word: string): string[] {
  const clean = word.trim();
  if (!clean) return loadPersonalWords();

  const existing = loadPersonalWords();
  const existsLower = existing.some((w) => w.toLowerCase() === clean.toLowerCase());
  const next = existsLower ? existing : [...existing, clean];

  try {
    localStorage.setItem(PERSONAL_DICT_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
  return next;
}

export function setPersonalWords(words: string[]): string[] {
  const cleaned = words
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  try {
    localStorage.setItem(PERSONAL_DICT_KEY, JSON.stringify(cleaned));
  } catch {
    // Ignore storage errors
  }
  return cleaned;
}

export function removePersonalWord(word: string): string[] {
  const existing = loadPersonalWords();
  const next = existing.filter((w) => w.toLowerCase() !== word.toLowerCase());
  return setPersonalWords(next);
}

export function getAllowPeek(): boolean {
  try {
    const raw = localStorage.getItem(ALLOW_PEEK_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function setAllowPeek(allow: boolean): void {
  try {
    localStorage.setItem(ALLOW_PEEK_KEY, String(allow));
  } catch {
    // Ignore storage errors
  }
}
