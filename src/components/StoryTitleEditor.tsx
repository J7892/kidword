import { useEffect, useRef } from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { SpellCheck, type ClickedSpellError } from '../extensions/SpellCheck';

interface StoryTitleEditorProps {
  value: string;
  onChange: (nextTitle: string) => void;
  onFocusBody: () => void;
  onWordClick: (error: ClickedSpellError) => void;
  onScheduleSpellCheck: () => void;
  onTitleSelectionUpdate: (editor: Editor) => void;
  onTitleTransaction: (editor: Editor, transaction: Transaction) => void;
  onEditorReady: (editor: Editor | null) => void;
}

export function StoryTitleEditor({
  value,
  onChange,
  onFocusBody,
  onWordClick,
  onScheduleSpellCheck,
  onTitleSelectionUpdate,
  onTitleTransaction,
  onEditorReady,
}: StoryTitleEditorProps) {
  const onChangeRef = useRef(onChange);
  const onFocusBodyRef = useRef(onFocusBody);
  const onWordClickRef = useRef(onWordClick);
  const onScheduleSpellCheckRef = useRef(onScheduleSpellCheck);
  const onSelectionUpdateRef = useRef(onTitleSelectionUpdate);
  const onTransactionRef = useRef(onTitleTransaction);
  const syncingExternalRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
    onFocusBodyRef.current = onFocusBody;
    onWordClickRef.current = onWordClick;
    onScheduleSpellCheckRef.current = onScheduleSpellCheck;
    onSelectionUpdateRef.current = onTitleSelectionUpdate;
    onTransactionRef.current = onTitleTransaction;
  });

  const titleEditor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
        hardBreak: false,
      }),
      Extension.create({
        name: 'titleSingleLine',
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              onFocusBodyRef.current();
              return true;
            },
            'Shift-Enter': () => true,
            ArrowDown: ({ editor }) => {
              if (editor.state.selection.to >= editor.state.doc.content.size - 1) {
                onFocusBodyRef.current();
                return true;
              }
              return false;
            },
          };
        },
      }),
      SpellCheck.configure({
        surface: 'title',
        onWordClick: (err) => onWordClickRef.current(err),
      }),
    ],
    content: value
      ? {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
        }
      : '<p></p>',
    editorProps: {
      attributes: {
        spellcheck: 'false',
        'aria-label': 'Story Title',
      },
      handlePaste(view, event) {
        const pasted = event.clipboardData?.getData('text/plain') ?? '';
        const singleLine = pasted.replace(/[\r\n]+/g, ' ');
        view.dispatch(view.state.tr.insertText(singleLine));
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (!syncingExternalRef.current) {
        onChangeRef.current(editor.getText().replace(/[\r\n]+/g, ' '));
      }
      onScheduleSpellCheckRef.current();
    },
    onSelectionUpdate: ({ editor }) => {
      onScheduleSpellCheckRef.current();
      onSelectionUpdateRef.current(editor);
    },
    onBlur: () => {
      onScheduleSpellCheckRef.current();
    },
    onTransaction: ({ editor, transaction }) => {
      onTransactionRef.current(editor, transaction);
    },
  });

  useEffect(() => {
    onEditorReady(titleEditor);
    return () => onEditorReady(null);
  }, [titleEditor, onEditorReady]);

  // Sync external story switches / resets into the title editor
  useEffect(() => {
    if (!titleEditor || titleEditor.isDestroyed) return;
    const currentText = titleEditor.getText().replace(/[\r\n]+/g, ' ');
    if (currentText === value) return;

    syncingExternalRef.current = true;
    titleEditor.commands.setContent(
      value
        ? {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
          }
        : '<p></p>',
      false
    );
    syncingExternalRef.current = false;
  }, [value, titleEditor]);

  const isEmpty = !value.trim();

  return (
    <div
      style={{ color: 'var(--ink)' }}
      className={`kidword-title-editor w-full border-b border-transparent pb-2 text-2xl leading-tight font-bold tracking-tight focus-within:border-current/15 sm:text-3xl ${
        isEmpty ? 'is-title-empty' : ''
      }`}
    >
      <EditorContent editor={titleEditor} />
    </div>
  );
}
