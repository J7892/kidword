import { useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, Settings, Trash2, X } from 'lucide-react';
import { BOOK_CARD_COLORS, STORY_EMOJIS } from '../constants/editorConfig';
import type { StoryRecord } from '../db/storiesDb';

interface StoriesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stories: StoryRecord[];
  activeStoryId: string;
  onSelectStory: (story: StoryRecord) => void;
  onCreateStory: () => void;
  onUpdateStoryIcon: (storyId: string, icon: string) => void;
  onDeleteStory: (storyId: string) => void;
  onOpenParentSettings: () => void;
  isNightMode: boolean;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatLastEdited(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function StoriesDrawer({
  isOpen,
  onClose,
  stories,
  activeStoryId,
  onSelectStory,
  onCreateStory,
  onUpdateStoryIcon,
  onDeleteStory,
  onOpenParentSettings,
  isNightMode,
}: StoriesDrawerProps) {
  const drawerRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [emojiPickerForId, setEmojiPickerForId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoryRecord | null>(null);

  // Sync drawer <dialog> open/closed with showModal()
  useEffect(() => {
    const dialog = drawerRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Fallback light-dismiss when closedby="any" is unsupported
  useEffect(() => {
    const dialog = drawerRef.current;
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

  // Sync delete confirmation <dialog>
  useEffect(() => {
    const dialog = confirmRef.current;
    if (!dialog) return;

    if (pendingDelete && !dialog.open) {
      dialog.showModal();
    } else if (!pendingDelete && dialog.open) {
      dialog.close();
    }
  }, [pendingDelete]);

  return (
    <>
      <dialog
        ref={drawerRef}
        closedby="any"
        aria-labelledby="stories-drawer-title"
        onClose={() => {
          setEmojiPickerForId(null);
          onClose();
        }}
        style={{
          backgroundColor: 'var(--page-bg)',
          color: 'var(--ink)',
          borderColor: 'var(--toolbar-border)',
        }}
        className="stories-drawer m-0 h-dvh max-h-dvh w-full max-w-md border-r p-0 shadow-2xl"
      >
        <div className="flex h-full flex-col">
          {/* Drawer Header */}
          <div
            className="flex items-center justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: 'var(--toolbar-border)' }}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="h-6 w-6 text-blue-500" aria-hidden="true" />
              <h2 id="stories-drawer-title" className="text-xl font-bold">
                My Stories
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onCreateStory();
                  onClose();
                }}
                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 stroke-[2.75]" aria-hidden="true" />
                <span>New Story</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  drawerRef.current?.close();
                  onOpenParentSettings();
                }}
                aria-label="Parent Settings"
                title="Parent Settings"
                style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition hover:opacity-85"
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => drawerRef.current?.close()}
                aria-label="Close My Stories"
                style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition hover:opacity-85"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Book Cards List */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {stories.map((story, idx) => {
              const palette = BOOK_CARD_COLORS[idx % BOOK_CARD_COLORS.length];
              const isActive = story.id === activeStoryId;
              const words = countWords(story.plainText);
              const showEmojiPicker = emojiPickerForId === story.id;

              return (
                <div
                  key={story.id}
                  style={{
                    backgroundColor: isNightMode ? palette.tintDark : palette.tintLight,
                    borderColor: isActive ? palette.spine : 'var(--page-border)',
                  }}
                  className={`relative overflow-hidden rounded-2xl border-2 transition ${
                    isActive ? 'shadow-md' : 'hover:shadow-sm'
                  }`}
                >
                  {/* Coloured Book Spine */}
                  <div
                    className="absolute inset-y-0 left-0 w-2.5"
                    style={{ backgroundColor: palette.spine }}
                    aria-hidden="true"
                  />

                  <div className="flex items-start gap-3 py-3.5 pr-3 pl-5">
                    {/* Emoji Cover Button */}
                    <button
                      type="button"
                      onClick={() => setEmojiPickerForId(showEmojiPicker ? null : story.id)}
                      aria-label={`Change icon for ${story.title || 'Untitled Story'}`}
                      title="Pick a cover icon"
                      className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white/80 text-2xl shadow-sm transition hover:scale-105 dark:bg-black/25"
                    >
                      {story.icon || '📝'}
                    </button>

                    {/* Story Info (click to open) */}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStory(story);
                        onClose();
                      }}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-base font-bold">
                          {story.title.trim() || 'Untitled Story'}
                        </span>
                        {isActive && (
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                            style={{ backgroundColor: palette.spine }}
                          >
                            Open
                          </span>
                        )}
                      </div>
                      <div
                        className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-medium"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        <span>
                          {words} {words === 1 ? 'word' : 'words'}
                        </span>
                        <span aria-hidden="true">•</span>
                        <span>{formatLastEdited(story.updatedAt)}</span>
                      </div>
                    </button>

                    {/* Delete Story Button */}
                    <button
                      type="button"
                      onClick={() => setPendingDelete(story)}
                      aria-label={`Delete ${story.title || 'Untitled Story'}`}
                      title="Delete story"
                      style={{ color: 'var(--ink-muted)' }}
                      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition hover:bg-red-500/15 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  {/* 12-Emoji Picker */}
                  {showEmojiPicker && (
                    <div
                      className="mx-4 mb-3 grid grid-cols-6 gap-1.5 rounded-xl border p-2"
                      style={{
                        backgroundColor: 'var(--page-bg)',
                        borderColor: 'var(--page-border)',
                      }}
                      role="group"
                      aria-label="Choose a story icon"
                    >
                      {STORY_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            onUpdateStoryIcon(story.id, emoji);
                            setEmojiPickerForId(null);
                          }}
                          className={`flex h-10 cursor-pointer items-center justify-center rounded-lg text-xl transition hover:scale-110 ${
                            story.icon === emoji ? 'bg-blue-500/20 ring-2 ring-blue-500' : ''
                          }`}
                          aria-label={`Use ${emoji} icon`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </dialog>

      {/* Delete Confirmation Modal */}
      <dialog
        ref={confirmRef}
        aria-labelledby="delete-confirm-title"
        onClose={() => setPendingDelete(null)}
        style={{
          backgroundColor: 'var(--page-bg)',
          color: 'var(--ink)',
          borderColor: 'var(--toolbar-border)',
        }}
        className="m-auto w-[90vw] max-w-sm rounded-2xl border p-6 shadow-2xl"
      >
        <h3 id="delete-confirm-title" className="text-lg font-bold">
          Delete this story?
        </h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
          “{pendingDelete?.title.trim() || 'Untitled Story'}” will be removed permanently.
        </p>
        <form method="dialog" className="mt-5 flex justify-end gap-2.5">
          <button
            type="submit"
            value="cancel"
            autoFocus
            style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
            className="h-10 cursor-pointer rounded-xl px-4 text-sm font-bold transition hover:opacity-85"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (pendingDelete) {
                onDeleteStory(pendingDelete.id);
                setPendingDelete(null);
              }
            }}
            className="h-10 cursor-pointer rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700"
          >
            Delete
          </button>
        </form>
      </dialog>
    </>
  );
}
