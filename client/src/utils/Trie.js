class TrieNode {
  constructor() {
    this.children = new Map();
    this.isEndOfWord = false;
  }
}

export class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let current = this.root;
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode());
      }
      current = current.children.get(char);
    }
    current.isEndOfWord = true;
  }

  searchPrefix(prefix, limit = 5) {
    let current = this.root;
    for (let i = 0; i < prefix.length; i++) {
      const char = prefix[i];
      if (!current.children.has(char)) {
        return [];
      }
      current = current.children.get(char);
    }

    const results = [];
    this._dfs(current, prefix, results, limit);
    return results;
  }

  _dfs(node, prefix, results, limit) {
    if (results.length >= limit) return;
    
    if (node.isEndOfWord) {
      results.push(prefix);
    }

    for (const [char, childNode] of node.children.entries()) {
      if (results.length >= limit) break;
      this._dfs(childNode, prefix + char, results, limit);
    }
  }

  buildFromList(words) {
    this.root = new TrieNode(); // reset
    for (const word of words) {
      this.insert(word);
    }
  }
}
