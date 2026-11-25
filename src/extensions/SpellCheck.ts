import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { SpellBlockInput, SpellErrorItem } from '../workers/spellcheck.worker';

export interface ClickedSpellError {
  word: string;
  suggestion: string | null;
  phoneticCandidates: string[];
  from: number;
  to: number;
  rect: DOMRect;
}

export interface SpellCheckOptions {
  onWordClick?: (error: ClickedSpellError) => void;
}

export const spellcheckPluginKey = new PluginKey<DecorationSet>('spellcheck');

export function extractSpellBlocks(
  doc: ProseMirrorNode,
  cursorPos?: number
): {
  blocks: SpellBlockInput[];
  cursorBlockPos?: number;
  cursorOffsetInBlock?: number;
} {
  const blocks: SpellBlockInput[] = [];
  let cursorBlockPos: number | undefined;
  let cursorOffsetInBlock: number | undefined;

  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      const contentStart = pos + 1;
      const contentEnd = contentStart + node.content.size;
      const text = node.textBetween(0, node.content.size, '\n', '\n');

      if (text.trim().length > 0) {
        blocks.push({ pos: contentStart, text });
      }

      if (cursorPos !== undefined && cursorPos >= contentStart && cursorPos <= contentEnd) {
        cursorBlockPos = contentStart;
        cursorOffsetInBlock = cursorPos - contentStart;
      }
      return false;
    }
    return true;
  });

  return { blocks, cursorBlockPos, cursorOffsetInBlock };
}

export function buildSpellDecorations(
  doc: ProseMirrorNode,
  errors: SpellErrorItem[]
): DecorationSet {
  if (errors.length === 0) {
    return DecorationSet.empty;
  }

  const maxPos = doc.content.size;
  const decorations: Decoration[] = [];

  for (const err of errors) {
    if (err.from >= 0 && err.to <= maxPos && err.from < err.to) {
      decorations.push(
        Decoration.inline(err.from, err.to, {
          class: 'spell-error',
          'data-word': err.word,
          'data-suggestion': err.suggestion ?? '',
          'data-candidates': err.phoneticCandidates.join('|'),
        })
      );
    }
  }

  return DecorationSet.create(doc, decorations);
}

export const SpellCheck = Extension.create<SpellCheckOptions>({
  name: 'spellCheck',

  addOptions() {
    return {
      onWordClick: undefined,
    };
  },

  addProseMirrorPlugins() {
    const onWordClick = this.options.onWordClick;

    return [
      new Plugin<DecorationSet>({
        key: spellcheckPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldSet) {
            const meta = tr.getMeta(spellcheckPluginKey) as
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
            return spellcheckPluginKey.getState(state);
          },
          handleClick(view, pos, event) {
            if (!onWordClick) return false;
            const target = event.target as HTMLElement | null;
            const span = target?.closest?.('.spell-error') as HTMLElement | null;
            if (!span) return false;

            const decos = spellcheckPluginKey.getState(view.state);
            const found = decos?.find(Math.max(0, pos - 1), Math.min(view.state.doc.content.size, pos + 1));
            const matched = found?.[0];

            const word = span.dataset.word || '';
            const suggestion = span.dataset.suggestion || null;
            const phoneticCandidates = span.dataset.candidates
              ? span.dataset.candidates.split('|').filter(Boolean)
              : [];
            if (!word) return false;

            onWordClick({
              word,
              suggestion,
              phoneticCandidates,
              from: matched?.from ?? pos,
              to: matched?.to ?? pos,
              rect: span.getBoundingClientRect(),
            });
            return false;
          },
        },
      }),
    ];
  },
});
