import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SpokenSentence {
  from: number;
  to: number;
  text: string;
}

export const readAloudPluginKey = new PluginKey<DecorationSet>('readAloudHighlight');

export function extractSentences(doc: ProseMirrorNode): SpokenSentence[] {
  const sentences: SpokenSentence[] = [];
  const sentenceRegex = /[^.!?\n]+(?:[.!?]+|$)/g;

  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      const contentStart = pos + 1;
      const text = node.textBetween(0, node.content.size, '\n', '\n');
      sentenceRegex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = sentenceRegex.exec(text)) !== null) {
        const raw = match[0];
        const trimmed = raw.trim();
        if (!trimmed) continue;

        const leadingSpaces = raw.length - raw.trimStart().length;
        const trailingSpaces = raw.length - raw.trimEnd().length;
        const from = contentStart + match.index + leadingSpaces;
        const to = contentStart + match.index + raw.length - trailingSpaces;

        if (from < to) {
          sentences.push({ from, to, text: trimmed });
        }
      }
      return false;
    }
    return true;
  });

  return sentences;
}

export function buildReadAloudDecoration(
  doc: ProseMirrorNode,
  range: { from: number; to: number } | null
): DecorationSet {
  if (!range || range.from < 0 || range.from >= range.to || range.to > doc.content.size) {
    return DecorationSet.empty;
  }
  return DecorationSet.create(doc, [
    Decoration.inline(range.from, range.to, {
      class: 'read-aloud-active',
    }),
  ]);
}

export const ReadAloudHighlight = Extension.create({
  name: 'readAloudHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: readAloudPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldSet) {
            const meta = tr.getMeta(readAloudPluginKey) as
              | { decorations?: DecorationSet }
              | undefined;
            if (meta?.decorations) {
              return meta.decorations;
            }
            if (tr.docChanged) {
              return oldSet.map(tr.mapping, tr.doc);
            }
            return oldSet;
          },
        },
        props: {
          decorations(state) {
            return readAloudPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});
