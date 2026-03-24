/**
 * trie.js — Client-side Trie for instant word validation feedback.
 *
 * The server sends the full word list as a JSON array on connection
 * (via the `dictionary` message). We build the Trie once and expose
 * two methods used by the board/drag hooks:
 *
 *   trie.search(word)      → true if `word` is a valid dictionary word
 *   trie.startsWith(prefix) → true if any word begins with `prefix`
 *
 * This mirrors the server-side Trie so the client can:
 *  1. Show live "valid" styling as you drag (green border when word exists)
 *  2. Prune impossible paths early (not strictly needed client-side, but
 *     useful if we ever add client-side solve previews)
 *
 * Usage:
 *   import { buildTrie } from './lib/trie.js';
 *   const trie = buildTrie(wordArray);
 *   trie.search('crane')      // true
 *   trie.startsWith('cra')    // true
 *   trie.startsWith('xyz')    // false
 */

class TrieNode {
  constructor() {
    // Using a plain object is faster than Map for ASCII char keys
    this.children = Object.create(null);
    this.isEnd = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  /** Insert a lowercase word into the trie. */
  insert(word) {
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      if (!node.children[ch]) node.children[ch] = new TrieNode();
      node = node.children[ch];
    }
    node.isEnd = true;
  }

  /** Returns true if `word` exists as a complete entry. */
  search(word) {
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      node = node.children[word[i]];
      if (!node) return false;
    }
    return node.isEnd;
  }

  /** Returns true if any inserted word starts with `prefix`. */
  startsWith(prefix) {
    let node = this.root;
    for (let i = 0; i < prefix.length; i++) {
      node = node.children[prefix[i]];
      if (!node) return false;
    }
    return true;
  }
}

/**
 * Build and return a Trie populated with the given word array.
 * Words are lower-cased and trimmed before insertion.
 *
 * @param {string[]} words
 * @returns {Trie}
 */
export function buildTrie(words) {
  const trie = new Trie();
  for (const word of words) {
    const w = word.trim().toLowerCase();
    if (w.length >= 3) trie.insert(w);
  }
  return trie;
}