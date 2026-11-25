import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  KeyRound,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { StoryRecord } from '../db/storiesDb';
import {
  applyBackupSettings,
  exportFullBackupJson,
  getParentPin,
  normalizePhone,
  parseBackupJson,
  setParentPin,
  type KidWordBackup,
  type WhatsAppContact,
} from '../utils/parentSettings';
import {
  loadPersonalWords,
  removePersonalWord,
  setAllowPeek,
} from '../utils/spellSettings';

interface ParentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stories: StoryRecord[];
  contacts: WhatsAppContact[];
  onContactsChange: (next: WhatsAppContact[]) => void;
  allowPeek: boolean;
  onAllowPeekChange: (next: boolean) => void;
  onPersonalWordsChanged: (words: string[]) => void;
  onRestoreBackup: (backup: KidWordBackup) => Promise<void>;
}

export function ParentSettingsModal({
  isOpen,
  onClose,
  stories,
  contacts,
  onContactsChange,
  allowPeek,
  onAllowPeekChange,
  onPersonalWordsChanged,
  onRestoreBackup,
}: ParentSettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Contact form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Personal dictionary state
  const [personalWords, setPersonalWordsState] = useState<string[]>([]);

  // Change PIN state
  const [nextPin, setNextPin] = useState('');
  const [pinSavedMsg, setPinSavedMsg] = useState('');

  // Backup status
  const [backupMsg, setBackupMsg] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      setIsUnlocked(false);
      setPinInput('');
      setPinError('');
      setPinSavedMsg('');
      setBackupMsg('');
      setPersonalWordsState(loadPersonalWords());
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

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === getParentPin()) {
      setIsUnlocked(true);
      setPinError('');
      setPinInput('');
    } else {
      setPinError('Incorrect PIN. (Default is 1234)');
    }
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    const cleanPhone = normalizePhone(newPhone);
    if (!cleanName || cleanPhone.length < 7) return;

    const contact: WhatsAppContact = {
      id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      phone: cleanPhone,
    };
    onContactsChange([...contacts, contact]);
    setNewName('');
    setNewPhone('');
  };

  const handleSaveEdit = (id: string) => {
    const cleanName = editName.trim();
    const cleanPhone = normalizePhone(editPhone);
    if (!cleanName || cleanPhone.length < 7) return;

    onContactsChange(
      contacts.map((c) => (c.id === id ? { ...c, name: cleanName, phone: cleanPhone } : c))
    );
    setEditingId(null);
  };

  const handleRemoveContact = (id: string) => {
    onContactsChange(contacts.filter((c) => c.id !== id));
  };

  const handleTogglePeek = () => {
    const next = !allowPeek;
    setAllowPeek(next);
    onAllowPeekChange(next);
  };

  const handleRemoveWord = (word: string) => {
    const next = removePersonalWord(word);
    setPersonalWordsState(next);
    onPersonalWordsChanged(next);
  };

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(nextPin)) {
      setPinSavedMsg('PIN must be 4 digits.');
      return;
    }
    setParentPin(nextPin);
    setNextPin('');
    setPinSavedMsg('PIN updated!');
    window.setTimeout(() => setPinSavedMsg(''), 2500);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const backup = parseBackupJson(text);
      applyBackupSettings(backup.settings);
      await onRestoreBackup(backup);
      setPersonalWordsState(backup.settings.personalWords);
      setBackupMsg(`Restored ${backup.stories.length} stories & settings!`);
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Could not read backup file.');
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="parent-settings-title"
      onClose={() => {
        setIsUnlocked(false);
        onClose();
      }}
      style={{
        backgroundColor: 'var(--page-bg)',
        color: 'var(--ink)',
        borderColor: 'var(--toolbar-border)',
      }}
      className="m-auto w-[92vw] max-w-xl rounded-3xl border-2 p-6 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Shield className="h-6 w-6 text-blue-600" aria-hidden="true" />
          <h2 id="parent-settings-title" className="text-xl font-bold">
            Parent Settings
          </h2>
        </div>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close Parent Settings"
          style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition hover:opacity-85"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {!isUnlocked ? (
        /* PIN Lock Screen */
        <form onSubmit={handleUnlock} className="mt-6 space-y-4">
          <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
            Enter the 4-digit parent PIN to manage WhatsApp contacts, spellchecker options, and
            backups.
          </p>

          <div>
            <label htmlFor="parent-pin-input" className="mb-1.5 block text-sm font-bold">
              4-Digit PIN
            </label>
            <input
              id="parent-pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                setPinError('');
              }}
              placeholder="••••"
              style={{
                backgroundColor: 'var(--control-bg)',
                borderColor: 'var(--toolbar-border)',
                color: 'var(--ink)',
              }}
              className="h-12 w-40 rounded-xl border px-4 text-center text-2xl font-bold tracking-[0.5em]"
            />
            {pinError && <p className="mt-2 text-sm font-semibold text-red-600">{pinError}</p>}
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
              className="h-10 cursor-pointer rounded-xl px-4 text-sm font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 cursor-pointer rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
            >
              Unlock
            </button>
          </div>
        </form>
      ) : (
        /* Unlocked Settings Panel */
        <div className="mt-5 max-h-[70vh] space-y-6 overflow-y-auto pr-1">
          {/* 1. Pre-Approved WhatsApp Contacts */}
          <section className="space-y-3">
            <h3 className="text-base font-bold">Pre-Approved WhatsApp Contacts</h3>
            <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
              Use international format without <code>+</code> (for example: <code>14165550123</code>).
            </p>

            {contacts.length > 0 && (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      backgroundColor: 'var(--control-bg)',
                      borderColor: 'var(--toolbar-border)',
                    }}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
                  >
                    {editingId === c.id ? (
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Name"
                          aria-label="Contact name"
                          className="h-8 w-28 rounded-lg border border-current/20 bg-transparent px-2 text-sm font-semibold"
                        />
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(normalizePhone(e.target.value))}
                          placeholder="14165550123"
                          aria-label="Contact phone"
                          className="h-8 w-36 rounded-lg border border-current/20 bg-transparent px-2 text-sm font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(c.id)}
                          aria-label="Save contact"
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-emerald-600 text-white"
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <span className="font-bold">{c.name}</span>
                          <span className="ml-2 font-mono text-xs" style={{ color: 'var(--ink-muted)' }}>
                            {c.phone}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(c.id);
                              setEditName(c.name);
                              setEditPhone(c.phone);
                            }}
                            aria-label={`Edit ${c.name}`}
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveContact(c.id)}
                            aria-label={`Remove ${c.name}`}
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-red-600 hover:bg-red-500/15"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddContact} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name (e.g. Dad)"
                aria-label="New contact name"
                style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
                className="h-10 min-w-[130px] flex-1 rounded-xl px-3 text-sm font-semibold"
              />
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(normalizePhone(e.target.value))}
                placeholder="Phone (e.g. 14165550123)"
                aria-label="New contact phone number"
                style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
                className="h-10 min-w-[160px] flex-1 rounded-xl px-3 font-mono text-sm"
              />
              <button
                type="submit"
                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-bold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add</span>
              </button>
            </form>
          </section>

          <hr style={{ borderColor: 'var(--toolbar-border)' }} />

          {/* 2. Spellchecker Settings */}
          <section className="space-y-3">
            <h3 className="text-base font-bold">Spelling Detective</h3>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: 'var(--toolbar-border)' }}>
              <div>
                <div className="text-sm font-bold">Allow 3-Second Peek in Spellchecker</div>
                <div className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                  Lets your child briefly peek at the full spelling for 3 seconds.
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowPeek}
                onChange={handleTogglePeek}
                className="h-5 w-5 cursor-pointer accent-blue-600"
              />
            </label>

            <div>
              <div className="mb-2 text-sm font-bold">
                Personal Dictionary ({personalWords.length})
              </div>
              {personalWords.length === 0 ? (
                <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                  No custom words added yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {personalWords.map((word) => (
                    <span
                      key={word}
                      style={{ backgroundColor: 'var(--control-bg)' }}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                    >
                      <span>{word}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveWord(word)}
                        aria-label={`Remove ${word} from personal dictionary`}
                        className="cursor-pointer rounded-full p-0.5 hover:bg-red-500/20 hover:text-red-600"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <hr style={{ borderColor: 'var(--toolbar-border)' }} />

          {/* 3. Change 4-Digit PIN */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-base font-bold">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>Change Parent PIN</span>
            </h3>
            <form onSubmit={handleChangePin} className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={nextPin}
                onChange={(e) => setNextPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="New 4-digit PIN"
                aria-label="New 4-digit PIN"
                style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
                className="h-10 w-40 rounded-xl px-3 text-sm font-bold tracking-widest"
              />
              <button
                type="submit"
                style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
                className="h-10 cursor-pointer rounded-xl px-4 text-sm font-bold hover:opacity-85"
              >
                Save PIN
              </button>
              {pinSavedMsg && (
                <span className="text-xs font-bold text-emerald-600">{pinSavedMsg}</span>
              )}
            </form>
          </section>

          <hr style={{ borderColor: 'var(--toolbar-border)' }} />

          {/* 4. Backup & Restore (.json) */}
          <section className="space-y-2.5">
            <h3 className="text-base font-bold">Backup &amp; Restore</h3>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  exportFullBackupJson(stories);
                  setBackupMsg('Backup downloaded!');
                }}
                style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-bold hover:opacity-85"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Export Backup (.json)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-bold hover:opacity-85"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Import Backup (.json)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>
            {backupMsg && (
              <p className="text-xs font-bold text-emerald-600">{backupMsg}</p>
            )}
          </section>
        </div>
      )}
    </dialog>
  );
}
