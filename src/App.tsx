import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import { Check, ChevronDown, ChevronUp, Eye, Sparkles, X } from 'lucide-react';
import { ParentSettingsModal } from './components/ParentSettingsModal';
import { SpellingDetectivePopover } from './components/SpellingDetectivePopover';
import { StoriesDrawer } from './components/StoriesDrawer';
import { StorySparkModal } from './components/StorySparkModal';
import { Toolbar, type ReadAloudSpeed, type ReadAloudStatus } from './components/Toolbar';
import { WhatsAppShareModal } from './components/WhatsAppShareModal';
import { FONTS, type PageTheme } from './constants/editorConfig';
import {
  createBlankStory,
  deleteStory,
  getAllStories,
  initActiveStory,
  saveStory,
  setActiveStoryId,
  type StoryRecord,
} from './db/storiesDb';
import { FontSize } from './extensions/FontSize';
import {
  ReadAloudHighlight,
  buildReadAloudDecoration,
  extractSentences,
  readAloudPluginKey,
  type SpokenSentence,
} from './extensions/ReadAloudHighlight';
import {
  SpellCheck,
  buildSpellDecorations,
  extractSpellBlocks,
  spellcheckPluginKey,
  type ClickedSpellError,
} from './extensions/SpellCheck';
import {
  loadWhatsAppContacts,
  saveWhatsAppContacts,
  type KidWordBackup,
  type WhatsAppContact,
} from './utils/parentSettings';
import { addPersonalWord, getAllowPeek, loadPersonalWords } from './utils/spellSettings';
import type { SpellWorkerRequest, SpellWorkerResponse } from './workers/spellcheck.worker';

type SaveStatus = 'idle' | 'saving' | 'saved';

export function App() {
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [activeStory, setActiveStory] = useState<StoryRecord | null>(null);
  const [title, setTitle] = useState('');
  const [defaultFont, setDefaultFont] = useState(FONTS[0].value);
  const [theme, setTheme] = useState<PageTheme>('warm-paper');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clickedSpellError, setClickedSpellError] = useState<ClickedSpellError | null>(null);
  const [allowPeek, setAllowPeekState] = useState<boolean>(() => getAllowPeek());
  const [contacts, setContacts] = useState<WhatsAppContact[]>(() => loadWhatsAppContacts());
  const [isParentSettingsOpen, setIsParentSettingsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [readAloudStatus, setReadAloudStatus] = useState<ReadAloudStatus>('idle');
  const [readAloudSpeed, setReadAloudSpeed] = useState<ReadAloudSpeed>('normal');
  const [isSparkOpen, setIsSparkOpen] = useState(false);
  const [pinnedIdea, setPinnedIdea] = useState<string | null>(null);
  const [ideaCollapsed, setIdeaCollapsed] = useState(false);

  const saveTimerRef = useRef<number | null>(null);
  const spellTimerRef = useRef<number | null>(null);
  const spellWorkerRef = useRef<Worker | null>(null);
  const spellWorkerReadyRef = useRef(false);
  const spellRequestIdRef = useRef(0);
  const phoneticResolversRef = useRef(new Map<number, (candidates: string[]) => void>());
  const activeStoryRef = useRef<StoryRecord | null>(null);
  const skipNextSaveRef = useRef(true);
  const readSentencesRef = useRef<SpokenSentence[]>([]);
  const readIndexRef = useRef(0);
  const readActiveSessionRef = useRef(0);

  useEffect(() => {
    activeStoryRef.current = activeStory;
  }, [activeStory]);

  const latestRef = useRef({ title, theme, defaultFont });
  useEffect(() => {
    latestRef.current = { title, theme, defaultFont };
  }, [title, theme, defaultFont]);

  const performSave = useCallback(
    async (
      storyToSave: StoryRecord,
      nextTitle: string,
      nextHtml: string,
      nextPlain: string,
      nextTheme: PageTheme,
      nextFont: string
    ) => {
      const updated: StoryRecord = {
        ...storyToSave,
        title: nextTitle,
        htmlContent: nextHtml,
        plainText: nextPlain,
        theme: nextTheme,
        fontFamily: nextFont,
        updatedAt: Date.now(),
      };
      await saveStory(updated);
      setActiveStory(updated);
      setStories((prev) => {
        const others = prev.filter((s) => s.id !== updated.id);
        return [updated, ...others];
      });
      setSaveStatus('saved');
    },
    []
  );

  const scheduleSaveRef = useRef<() => void>(() => {});
  const scheduleSpellCheckRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      ReadAloudHighlight,
      SpellCheck.configure({
        onWordClick: (err) => {
          setClickedSpellError(err);
        },
      }),
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        spellcheck: 'false',
        'aria-label': 'Story writing area',
      },
    },
    onUpdate: () => {
      scheduleSaveRef.current();
      scheduleSpellCheckRef.current();
    },
    onSelectionUpdate: () => {
      scheduleSpellCheckRef.current();
    },
  });

  const scheduleSave = useCallback(() => {
    if (skipNextSaveRef.current) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    setSaveStatus('saving');
    saveTimerRef.current = window.setTimeout(() => {
      const current = activeStoryRef.current;
      if (!current || !editor) return;
      const { title: t, theme: th, defaultFont: df } = latestRef.current;
      void performSave(current, t, editor.getHTML(), editor.getText(), th, df);
    }, 500);
  }, [editor, performSave]);

  useEffect(() => {
    scheduleSaveRef.current = scheduleSave;
  }, [scheduleSave]);

  const runSpellCheckNow = useCallback(() => {
    const worker = spellWorkerRef.current;
    if (!worker || !spellWorkerReadyRef.current || !editor) return;

    const cursorPos = editor.state.selection.empty ? editor.state.selection.from : undefined;
    const { blocks, cursorBlockPos, cursorOffsetInBlock } = extractSpellBlocks(
      editor.state.doc,
      cursorPos
    );
    const requestId = ++spellRequestIdRef.current;
    const msg: SpellWorkerRequest = {
      type: 'check',
      requestId,
      blocks,
      cursorBlockPos,
      cursorOffsetInBlock,
    };
    worker.postMessage(msg);
  }, [editor]);

  const scheduleSpellCheck = useCallback(() => {
    if (spellTimerRef.current !== null) {
      window.clearTimeout(spellTimerRef.current);
    }
    spellTimerRef.current = window.setTimeout(() => {
      runSpellCheckNow();
    }, 180);
  }, [runSpellCheckNow]);

  useEffect(() => {
    scheduleSpellCheckRef.current = scheduleSpellCheck;
  }, [scheduleSpellCheck]);

  // Initialize Canadian English nspell Web Worker
  useEffect(() => {
    if (!editor) return;

    const worker = new Worker(new URL('./workers/spellcheck.worker.ts', import.meta.url), {
      type: 'module',
    });
    spellWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<SpellWorkerResponse>) => {
      const data = event.data;
      if (data.type === 'ready') {
        spellWorkerReadyRef.current = true;
        runSpellCheckNow();
        return;
      }
      if (data.type === 'result') {
        if (data.requestId !== spellRequestIdRef.current) return;
        const decorations = buildSpellDecorations(editor.state.doc, data.errors);
        editor.view.dispatch(
          editor.state.tr.setMeta(spellcheckPluginKey, { decorations })
        );
        return;
      }
      if (data.type === 'phonetic-result') {
        const resolver = phoneticResolversRef.current.get(data.requestId);
        if (resolver) {
          phoneticResolversRef.current.delete(data.requestId);
          resolver(data.candidates);
        }
      }
    };

    const baseUrl = new URL('./', window.location.href).href;
    const initMsg: SpellWorkerRequest = {
      type: 'init',
      baseUrl,
      personalWords: loadPersonalWords(),
    };
    worker.postMessage(initMsg);

    return () => {
      spellWorkerReadyRef.current = false;
      spellWorkerRef.current = null;
      worker.terminate();
    };
  }, [editor, runSpellCheckNow]);

  // Initialize IndexedDB stories once editor is ready
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;

    void initActiveStory().then(({ active, stories: all }) => {
      if (cancelled) return;
      skipNextSaveRef.current = true;
      const normalizedTheme: PageTheme =
        active.theme === 'lined-notebook' ? 'lined-notebook' : 'warm-paper';
      setStories(all);
      setActiveStory(active);
      setTitle(active.title);
      setTheme(normalizedTheme);
      setDefaultFont(active.fontFamily || FONTS[0].value);
      editor.commands.setContent(active.htmlContent || '<p></p>', false);
      setSaveStatus('saved');
      requestAnimationFrame(() => {
        skipNextSaveRef.current = false;
        runSpellCheckNow();
      });
    });

    return () => {
      cancelled = true;
    };
  }, [editor, runSpellCheckNow]);

  // Trigger 500ms debounced save when title, theme, or defaultFont change
  useEffect(() => {
    if (!activeStoryRef.current || !editor) return;
    scheduleSave();
  }, [title, theme, defaultFont, editor, scheduleSave]);

  // Cleanup timers & speech on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (spellTimerRef.current !== null) {
        window.clearTimeout(spellTimerRef.current);
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Apply theme to document root & PWA theme-color meta tag
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      const colors: Record<PageTheme, string> = {
        'warm-paper': '#FBF7EE',
        'lined-notebook': '#FFFDF7',
      };
      themeColorMeta.setAttribute('content', colors[theme]);
    }
  }, [theme]);

  // Sync browser Fullscreen API state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const stopReadAloud = useCallback(() => {
    readActiveSessionRef.current += 1;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setReadAloudStatus('idle');
    if (editor) {
      const decorations = buildReadAloudDecoration(editor.state.doc, null);
      editor.view.dispatch(editor.state.tr.setMeta(readAloudPluginKey, { decorations }));
    }
  }, [editor]);

  const speakSentenceAt = useCallback(
    (index: number, speed: ReadAloudSpeed, sessionId: number) => {
      if (!editor || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      if (sessionId !== readActiveSessionRef.current) return;

      const sentences = readSentencesRef.current;
      if (index >= sentences.length) {
        stopReadAloud();
        return;
      }

      const sentence = sentences[index];
      readIndexRef.current = index;

      const decorations = buildReadAloudDecoration(editor.state.doc, {
        from: sentence.from,
        to: sentence.to,
      });
      editor.view.dispatch(editor.state.tr.setMeta(readAloudPluginKey, { decorations }));

      const utterance = new SpeechSynthesisUtterance(sentence.text);
      utterance.rate = speed === 'slow' ? 0.78 : 1.0;

      utterance.onend = () => {
        if (sessionId !== readActiveSessionRef.current) return;
        speakSentenceAt(index + 1, speed, sessionId);
      };

      utterance.onerror = () => {
        if (sessionId !== readActiveSessionRef.current) return;
        stopReadAloud();
      };

      window.speechSynthesis.speak(utterance);
    },
    [editor, stopReadAloud]
  );

  const handleReadPlayPause = useCallback(() => {
    if (!editor || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (readAloudStatus === 'playing') {
      window.speechSynthesis.pause();
      setReadAloudStatus('paused');
      return;
    }

    if (readAloudStatus === 'paused') {
      window.speechSynthesis.resume();
      setReadAloudStatus('playing');
      return;
    }

    const sentences = extractSentences(editor.state.doc);
    if (sentences.length === 0) return;

    readSentencesRef.current = sentences;
    const cursorPos = editor.state.selection.from;
    let startIdx = 0;
    if (cursorPos > 1) {
      const foundIdx = sentences.findIndex((s) => s.to >= cursorPos);
      if (foundIdx !== -1) {
        startIdx = foundIdx;
      }
    }

    window.speechSynthesis.cancel();
    const sessionId = ++readActiveSessionRef.current;
    setReadAloudStatus('playing');
    speakSentenceAt(startIdx, readAloudSpeed, sessionId);
  }, [editor, readAloudSpeed, readAloudStatus, speakSentenceAt]);

  const handleToggleReadSpeed = useCallback(() => {
    const nextSpeed: ReadAloudSpeed = readAloudSpeed === 'normal' ? 'slow' : 'normal';
    setReadAloudSpeed(nextSpeed);

    if (readAloudStatus === 'playing' || readAloudStatus === 'paused') {
      window.speechSynthesis.cancel();
      const sessionId = ++readActiveSessionRef.current;
      setReadAloudStatus('playing');
      speakSentenceAt(readIndexRef.current, nextSpeed, sessionId);
    }
  }, [readAloudSpeed, readAloudStatus, speakSentenceAt]);

  const handleInsertStoryIdea = useCallback(
    (promptText: string) => {
      setPinnedIdea(promptText);
      setIdeaCollapsed(false);
      if (editor && editor.getText().trim() === '') {
        editor.commands.setContent(`<p><em>${promptText}</em></p><p></p>`, true);
        editor.commands.focus('end');
      }
    },
    [editor]
  );

  const loadStoryIntoEditor = useCallback(
    (story: StoryRecord) => {
      if (!editor) return;
      stopReadAloud();
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      skipNextSaveRef.current = true;
      const normalizedTheme: PageTheme =
        story.theme === 'lined-notebook' ? 'lined-notebook' : 'warm-paper';
      setActiveStory(story);
      setActiveStoryId(story.id);
      setTitle(story.title);
      setTheme(normalizedTheme);
      setDefaultFont(story.fontFamily || FONTS[0].value);
      editor.commands.setContent(story.htmlContent || '<p></p>', false);
      setSaveStatus('saved');
      setClickedSpellError(null);
      requestAnimationFrame(() => {
        skipNextSaveRef.current = false;
        runSpellCheckNow();
      });
    },
    [editor, runSpellCheckNow, stopReadAloud]
  );

  const handleAddPersonalWord = useCallback(
    (word: string) => {
      addPersonalWord(word);
      const worker = spellWorkerRef.current;
      if (worker) {
        const msg: SpellWorkerRequest = { type: 'add-word', word };
        worker.postMessage(msg);
      }
      runSpellCheckNow();
    },
    [runSpellCheckNow]
  );

  const handleRequestPhoneticLookup = useCallback(
    (word: string, exclude?: string): Promise<string[]> => {
      const worker = spellWorkerRef.current;
      if (!worker || !spellWorkerReadyRef.current) {
        return Promise.resolve([]);
      }
      const requestId = ++spellRequestIdRef.current;
      return new Promise((resolve) => {
        phoneticResolversRef.current.set(requestId, resolve);
        const msg: SpellWorkerRequest = {
          type: 'phonetic-lookup',
          requestId,
          word,
          exclude,
        };
        worker.postMessage(msg);
      });
    },
    []
  );

  const reloadWorkerPersonalWords = useCallback((words: string[]) => {
    const worker = spellWorkerRef.current;
    if (!worker) return;
    spellWorkerReadyRef.current = false;
    const baseUrl = new URL('./', window.location.href).href;
    const msg: SpellWorkerRequest = {
      type: 'init',
      baseUrl,
      personalWords: words,
    };
    worker.postMessage(msg);
  }, []);

  const handleContactsChange = useCallback((next: WhatsAppContact[]) => {
    setContacts(next);
    saveWhatsAppContacts(next);
  }, []);

  const handleRestoreBackup = useCallback(
    async (backup: KidWordBackup) => {
      for (const story of backup.stories) {
        await saveStory(story);
      }
      const all = await getAllStories();
      setStories(all);
      setContacts(backup.settings.whatsappContacts);
      setAllowPeekState(backup.settings.allowPeek);
      reloadWorkerPersonalWords(backup.settings.personalWords);
      if (all.length > 0) {
        loadStoryIntoEditor(all[0]);
      }
    },
    [loadStoryIntoEditor, reloadWorkerPersonalWords]
  );

  const handleCreateStory = async () => {
    const fresh = createBlankStory(theme, defaultFont);
    await saveStory(fresh);
    const updatedList = await getAllStories();
    setStories(updatedList);
    loadStoryIntoEditor(fresh);
  };

  const handleUpdateStoryIcon = async (storyId: string, icon: string) => {
    const target = stories.find((s) => s.id === storyId);
    if (!target) return;
    const updated: StoryRecord = { ...target, icon };
    await saveStory(updated);
    setStories((prev) => prev.map((s) => (s.id === storyId ? updated : s)));
    if (activeStory?.id === storyId) {
      setActiveStory(updated);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    await deleteStory(storyId);
    let remaining = await getAllStories();
    if (remaining.length === 0) {
      const fresh = createBlankStory(theme, defaultFont);
      await saveStory(fresh);
      remaining = [fresh];
    }
    setStories(remaining);
    if (activeStory?.id === storyId) {
      loadStoryIntoEditor(remaining[0]);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if fullscreen is blocked by browser policy
    }
  };

  const isLined = theme === 'lined-notebook';

  return (
    <div className="min-h-screen flex flex-col">
      {!isFocusMode ? (
        <Toolbar
          editor={editor}
          defaultFont={defaultFont}
          onDefaultFontChange={setDefaultFont}
          theme={theme}
          onThemeChange={setTheme}
          onOpenStories={() => setIsDrawerOpen(true)}
          readAloudStatus={readAloudStatus}
          readAloudSpeed={readAloudSpeed}
          onReadPlayPause={handleReadPlayPause}
          onReadStop={stopReadAloud}
          onToggleReadSpeed={handleToggleReadSpeed}
          onOpenStorySpark={() => setIsSparkOpen(true)}
          onOpenShare={() => setIsShareOpen(true)}
          onEnableFocusMode={() => setIsFocusMode(true)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsFocusMode(false)}
          aria-label="Show writing tools"
          title="Show Tools"
          style={{
            backgroundColor: 'var(--toolbar-bg)',
            borderColor: 'var(--toolbar-border)',
            color: 'var(--ink)',
          }}
          className="no-print fixed top-4 right-4 z-40 flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold shadow-md backdrop-blur-md transition hover:scale-105"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span>Show Tools</span>
        </button>
      )}

      {/* Centered, generous writing canvas */}
      <main className="flex-1 px-3 py-6 sm:px-6 sm:py-10">
        {/* Collapsible Pinned Story Idea Banner */}
        {pinnedIdea && (
          <div
            style={{
              backgroundColor: 'var(--toolbar-bg)',
              borderColor: 'var(--toolbar-border)',
              color: 'var(--ink)',
            }}
            className="no-print mx-auto mb-4 w-full max-w-[780px] rounded-2xl border px-4 py-2.5 shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIdeaCollapsed((prev) => !prev)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-sm font-bold"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                <span>Story Idea</span>
                {ideaCollapsed ? (
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                ) : (
                  <ChevronUp className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setPinnedIdea(null)}
                aria-label="Dismiss story idea"
                style={{ color: 'var(--ink-muted)' }}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition hover:bg-black/10 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {!ideaCollapsed && (
              <p className="mt-1.5 text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
                “{pinnedIdea}”
              </p>
            )}
          </div>
        )}

        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              editor?.commands.focus('end');
            }
          }}
          style={{ fontFamily: defaultFont }}
          className="paper-surface mx-auto min-h-[78vh] w-full max-w-[780px] cursor-text rounded-2xl px-6 py-8 sm:px-14 sm:py-12"
        >
          {/* Editable Story Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Story Title..."
            spellCheck={false}
            aria-label="Story Title"
            style={{ color: 'var(--ink)' }}
            className={`mb-6 w-full border-b border-transparent bg-transparent pb-2 text-2xl font-bold tracking-tight placeholder:opacity-45 focus:border-current/15 focus:outline-none sm:text-3xl ${
              isLined ? 'sm:pl-16' : ''
            }`}
          />

          {/* Tiptap Writing Surface */}
          <div className={`kidword-editor ${isLined ? 'paper-lined rounded-lg sm:pl-16' : ''}`}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </main>

      {/* Subtle Auto-Save Status Indicator */}
      {saveStatus !== 'idle' && (
        <div
          aria-live="polite"
          style={{
            backgroundColor: 'var(--toolbar-bg)',
            borderColor: 'var(--toolbar-border)',
            color: 'var(--ink-muted)',
          }}
          className="no-print pointer-events-none fixed right-4 bottom-4 z-20 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-sm"
        >
          {saveStatus === 'saved' && (
            <Check className="h-3.5 w-3.5 text-emerald-500 stroke-[2.5]" aria-hidden="true" />
          )}
          <span>{saveStatus === 'saving' ? 'Saving...' : 'Saved'}</span>
        </div>
      )}

      {/* Slide-over My Stories Drawer */}
      <StoriesDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        stories={stories}
        activeStoryId={activeStory?.id ?? ''}
        onSelectStory={loadStoryIntoEditor}
        onCreateStory={handleCreateStory}
        onUpdateStoryIcon={handleUpdateStoryIcon}
        onDeleteStory={handleDeleteStory}
        onOpenParentSettings={() => setIsParentSettingsOpen(true)}
        isNightMode={false}
      />

      {/* Parent Settings Modal (4-digit PIN) */}
      <ParentSettingsModal
        isOpen={isParentSettingsOpen}
        onClose={() => setIsParentSettingsOpen(false)}
        stories={stories}
        contacts={contacts}
        onContactsChange={handleContactsChange}
        allowPeek={allowPeek}
        onAllowPeekChange={setAllowPeekState}
        onPersonalWordsChanged={reloadWorkerPersonalWords}
        onRestoreBackup={handleRestoreBackup}
      />

      {/* WhatsApp Share Modal */}
      <WhatsAppShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        title={title}
        plainText={editor?.getText() ?? ''}
        contacts={contacts}
      />

      {/* 3-Step Spelling Detective Hint Popover */}
      <SpellingDetectivePopover
        error={clickedSpellError}
        allowPeek={allowPeek}
        onClose={() => setClickedSpellError(null)}
        onAddPersonalWord={handleAddPersonalWord}
        onRequestPhoneticLookup={handleRequestPhoneticLookup}
      />

      {/* Story Spark Dice Modal */}
      <StorySparkModal
        isOpen={isSparkOpen}
        onClose={() => setIsSparkOpen(false)}
        onInsertIdea={handleInsertStoryIdea}
      />
    </div>
  );
}

export default App;
