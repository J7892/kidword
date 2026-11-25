import type { StoryRecord } from '../db/storiesDb';
import {
  getAllowPeek,
  loadPersonalWords,
  setAllowPeek,
  setPersonalWords,
} from './spellSettings';

export interface WhatsAppContact {
  id: string;
  name: string;
  phone: string; // International format without '+'
}

export interface KidWordBackup {
  version: number;
  exportedAt: string;
  stories: StoryRecord[];
  settings: {
    parentPin: string;
    allowPeek: boolean;
    whatsappContacts: WhatsAppContact[];
    personalWords: string[];
  };
}

const PIN_KEY = 'kidword-parent-pin';
const CONTACTS_KEY = 'kidword-whatsapp-contacts';
const DEFAULT_PIN = '1234';

export function getParentPin(): string {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (raw && /^\d{4}$/.test(raw)) {
      return raw;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_PIN;
}

export function setParentPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return false;
  try {
    localStorage.setItem(PIN_KEY, pin);
    return true;
  } catch {
    return false;
  }
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function loadWhatsAppContacts(): WhatsAppContact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (c): c is WhatsAppContact =>
          typeof c === 'object' &&
          c !== null &&
          typeof c.id === 'string' &&
          typeof c.name === 'string' &&
          typeof c.phone === 'string'
      );
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}

export function saveWhatsAppContacts(contacts: WhatsAppContact[]): void {
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  } catch {
    // Ignore storage errors
  }
}

export function exportFullBackupJson(stories: StoryRecord[]): void {
  const backup: KidWordBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    stories,
    settings: {
      parentPin: getParentPin(),
      allowPeek: getAllowPeek(),
      whatsappContacts: loadWhatsAppContacts(),
      personalWords: loadPersonalWords(),
    },
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const dateStr = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kidword-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseBackupJson(rawText: string): KidWordBackup {
  const parsed = JSON.parse(rawText) as Partial<KidWordBackup>;
  if (!parsed || !Array.isArray(parsed.stories)) {
    throw new Error('Invalid backup file: missing stories list.');
  }

  const validStories: StoryRecord[] = parsed.stories.filter(
    (s): s is StoryRecord =>
      typeof s === 'object' &&
      s !== null &&
      typeof s.id === 'string' &&
      typeof s.htmlContent === 'string'
  );

  const settings = parsed.settings ?? {
    parentPin: DEFAULT_PIN,
    allowPeek: true,
    whatsappContacts: [],
    personalWords: [],
  };

  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    stories: validStories,
    settings: {
      parentPin:
        typeof settings.parentPin === 'string' && /^\d{4}$/.test(settings.parentPin)
          ? settings.parentPin
          : DEFAULT_PIN,
      allowPeek: typeof settings.allowPeek === 'boolean' ? settings.allowPeek : true,
      whatsappContacts: Array.isArray(settings.whatsappContacts)
        ? settings.whatsappContacts.filter(
            (c): c is WhatsAppContact =>
              typeof c === 'object' &&
              c !== null &&
              typeof c.id === 'string' &&
              typeof c.name === 'string' &&
              typeof c.phone === 'string'
          )
        : [],
      personalWords: Array.isArray(settings.personalWords)
        ? settings.personalWords.filter((w): w is string => typeof w === 'string')
        : [],
    },
  };
}

export function applyBackupSettings(settings: KidWordBackup['settings']): void {
  setParentPin(settings.parentPin);
  setAllowPeek(settings.allowPeek);
  saveWhatsAppContacts(settings.whatsappContacts);
  setPersonalWords(settings.personalWords);
}
