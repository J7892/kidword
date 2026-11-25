import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, ExternalLink, MessageCircle, X } from 'lucide-react';
import type { WhatsAppContact } from '../utils/parentSettings';

interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  plainText: string;
  contacts: WhatsAppContact[];
}

const MAX_WA_URL_TEXT_LENGTH = 3500;

export function WhatsAppShareModal({
  isOpen,
  onClose,
  title,
  plainText,
  contacts,
}: WhatsAppShareModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      setCopiedNotice(false);
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

  const formattedMessage = `*${title.trim() || 'My Story'}*\n\n${plainText.trim()}`;
  const isVeryLong = formattedMessage.length > MAX_WA_URL_TEXT_LENGTH;

  const handleOpenWhatsApp = async (phone?: string) => {
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';

    if (isVeryLong) {
      try {
        await navigator.clipboard.writeText(formattedMessage);
        setCopiedNotice(true);
      } catch {
        // Ignore clipboard errors if denied
      }
      window.open(base, '_blank', 'noopener,noreferrer');
      return;
    }

    const url = `${base}?text=${encodeURIComponent(formattedMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="whatsapp-share-title"
      onClose={onClose}
      style={{
        backgroundColor: 'var(--page-bg)',
        color: 'var(--ink)',
        borderColor: 'var(--toolbar-border)',
      }}
      className="m-auto w-[92vw] max-w-md rounded-3xl border-2 p-6 shadow-2xl"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-600">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="whatsapp-share-title" className="text-xl font-bold">
              Share Story
            </h2>
            <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
              Send your story on WhatsApp Web
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close Share"
          style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition hover:opacity-85"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {isVeryLong && (
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-400/50 bg-amber-500/15 p-3 text-xs font-semibold text-amber-900">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {copiedNotice
              ? 'Copied to your clipboard! Paste it into the WhatsApp chat that just opened.'
              : 'Your story is extra long! Clicking a button below will copy it to your clipboard so you can paste it into WhatsApp Web.'}
          </span>
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        {contacts.map((contact) => (
          <button
            key={contact.id}
            type="button"
            onClick={() => void handleOpenWhatsApp(contact.phone)}
            className="flex h-14 w-full cursor-pointer items-center justify-between rounded-2xl bg-emerald-600 px-5 text-base font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <span>Send to {contact.name}</span>
            <ExternalLink className="h-5 w-5 opacity-85" aria-hidden="true" />
          </button>
        ))}

        <button
          type="button"
          onClick={() => void handleOpenWhatsApp()}
          style={{ backgroundColor: 'var(--control-bg)', color: 'var(--ink)' }}
          className="flex h-12 w-full cursor-pointer items-center justify-between rounded-2xl px-5 text-sm font-bold transition hover:opacity-90"
        >
          <span>Open WhatsApp (pick chat)</span>
          <ExternalLink className="h-4 w-4 opacity-70" aria-hidden="true" />
        </button>
      </div>
    </dialog>
  );
}
