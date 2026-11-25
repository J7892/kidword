declare module 'nspell' {
  export interface NSpellInstance {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string, model?: string): NSpellInstance;
    remove(word: string): NSpellInstance;
  }

  export default function nspell(aff: string | Uint8Array, dic?: string | Uint8Array): NSpellInstance;
}
