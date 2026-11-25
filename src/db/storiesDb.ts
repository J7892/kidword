import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { FONTS, type PageTheme } from '../constants/editorConfig';

export interface StoryRecord {
  id: string;
  title: string;
  icon: string;
  htmlContent: string;
  plainText: string;
  theme: PageTheme;
  fontFamily: string;
  createdAt: number;
  updatedAt: number;
}

interface KidWordDB extends DBSchema {
  stories: {
    key: string;
    value: StoryRecord;
    indexes: { 'by-updated': number };
  };
}

const DB_NAME = 'kidword-db';
const DB_VERSION = 1;
const STORE_NAME = 'stories';
const ACTIVE_ID_KEY = 'kidword-active-story-id';
const LEGACY_STORAGE_KEY = 'kidword-story-v1';

let dbPromise: Promise<IDBPDatabase<KidWordDB>> | null = null;

function getDb(): Promise<IDBPDatabase<KidWordDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KidWordDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by-updated', 'updatedAt');
        }
      },
    });
  }
  return dbPromise;
}

export function createBlankStory(
  theme: PageTheme = 'warm-paper',
  fontFamily: string = FONTS[0].value
): StoryRecord {
  const now = Date.now();
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `story-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    icon: '📝',
    htmlContent: '<p></p>',
    plainText: '',
    theme,
    fontFamily,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getAllStories(): Promise<StoryRecord[]> {
  const db = await getDb();
  const stories = await db.getAllFromIndex(STORE_NAME, 'by-updated');
  return stories.reverse();
}

export async function getStory(id: string): Promise<StoryRecord | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, id);
}

export async function saveStory(story: StoryRecord): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, story);
}

export async function deleteStory(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export function getActiveStoryId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveStoryId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_ID_KEY, id);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Loads the initial active story on app startup, migrating any legacy localStorage story
 * into IndexedDB if the database is empty.
 */
export async function initActiveStory(): Promise<{ active: StoryRecord; stories: StoryRecord[] }> {
  let stories = await getAllStories();

  if (stories.length === 0) {
    let migrated: StoryRecord | null = null;
    try {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw) as Partial<{
          title: string;
          content: string;
          fontFamily: string;
          theme: PageTheme;
        }>;
        const blank = createBlankStory(
          parsed.theme === 'warm-paper' || parsed.theme === 'lined-notebook'
            ? parsed.theme
            : 'warm-paper',
          typeof parsed.fontFamily === 'string' ? parsed.fontFamily : FONTS[0].value
        );
        const htmlContent = typeof parsed.content === 'string' ? parsed.content : '<p></p>';
        const temp = document.createElement('div');
        temp.innerHTML = htmlContent;
        migrated = {
          ...blank,
          title: typeof parsed.title === 'string' ? parsed.title : '',
          htmlContent,
          plainText: temp.textContent || '',
        };
      }
    } catch {
      // Ignore legacy parse issues
    }

    const firstStory = migrated ?? createBlankStory();
    await saveStory(firstStory);
    setActiveStoryId(firstStory.id);
    stories = [firstStory];
    return { active: firstStory, stories };
  }

  const savedActiveId = getActiveStoryId();
  const matched = savedActiveId ? stories.find((s) => s.id === savedActiveId) : undefined;
  const active = matched ?? stories[0];
  setActiveStoryId(active.id);
  return { active, stories };
}
