/**
 * In-memory BM25 (Okapi) index used for lexical search alongside the
 * vector index. The tokenizer is tuned for Korean/CJK notes: CJK words are
 * expanded into 2-gram and 3-gram tokens, with a light Korean particle strip
 * so suffix changes do not hide otherwise relevant notes.
 */

// Hangul, Han (CJK ideographs), Hiragana/Katakana ranges.
// Unicode escapes keep this stable even when a terminal renders Korean poorly.
const CJK_CHAR_REGEX =
  /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/

const KOREAN_PARTICLE_SUFFIXES = [
  '으로서',
  '으로써',
  '으로',
  '에게',
  '에서',
  '부터',
  '까지',
  '처럼',
  '보다',
  '마다',
  '께서',
  '은',
  '는',
  '이',
  '가',
  '을',
  '를',
  '과',
  '와',
  '도',
  '만',
  '의',
  '에',
  '로',
]

/**
 * Tokenizes text into lowercase word tokens. CJK words are additionally
 * expanded into character 2-grams and 3-grams so queries match despite
 * agglutinative suffixes, Korean particles, or missing whitespace.
 */
export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const tokens: string[] = []
  for (const word of words) {
    if (CJK_CHAR_REGEX.test(word)) {
      tokens.push(...tokenizeCjkWord(word))
    } else {
      tokens.push(word)
    }
  }
  return tokens
}

function tokenizeCjkWord(word: string): string[] {
  const tokens = new Set<string>()
  const normalized = stripKoreanParticle(word)
  for (const candidate of [word, normalized]) {
    if (!candidate) {
      continue
    }
    // Count by character, not by UTF-16 unit: a Han character outside the
    // basic plane (U+20000 and up) is two units, and half of it is a token
    // the database rejects as invalid JSON.
    const chars = Array.from(candidate)
    for (let size = 1; size <= 3; size += 1) {
      if (chars.length < size) {
        continue
      }
      for (let i = 0; i <= chars.length - size; i += 1) {
        tokens.add(chars.slice(i, i + size).join(''))
      }
    }
  }
  return [...tokens]
}

function stripKoreanParticle(word: string): string {
  for (const suffix of KOREAN_PARTICLE_SUFFIXES) {
    if (word.length > suffix.length + 1 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length)
    }
  }
  return word
}

export type Bm25SearchResult = {
  /** Index of the document in the array passed to the constructor */
  index: number
  /** Raw BM25 score (unbounded, > 0) */
  score: number
}

/** Per-document term frequencies + token length; the unit the index stores. */
type DocStats = { termFreq: Map<string, number>; length: number }

/**
 * Serializable form of {@link DocStats} persisted alongside the lexical index
 * so it can be rebuilt without re-reading or re-tokenizing the vault.
 */
export type TermFreqDoc = { termFreq: Record<string, number>; length: number }

function tokenizeToStats(text: string): DocStats {
  const tokens = tokenize(text)
  const termFreq = new Map<string, number>()
  for (const token of tokens) {
    termFreq.set(token, (termFreq.get(token) ?? 0) + 1)
  }
  return { termFreq, length: tokens.length }
}

/**
 * Tokenize indexable text into a serializable term-frequency map. Callers
 * persist the result so a saved index can be restored via
 * {@link Bm25Index.fromTermFreqs} without re-tokenizing the document body.
 */
export function computeTermFreq(text: string): TermFreqDoc {
  const { termFreq, length } = tokenizeToStats(text)
  return { termFreq: Object.fromEntries(termFreq), length }
}

export class Bm25Index {
  private static readonly K1 = 1.2
  private static readonly B = 0.75

  private docLengths: number[] = []
  /**
   * Inverted index: term → postings list of `{ doc, tf }`. A query only touches
   * the documents that actually contain its terms, instead of scoring every
   * document, so search stays fast as the vault grows.
   */
  private postings = new Map<string, { doc: number; tf: number }[]>()
  private avgDocLength = 0

  constructor(documents: string[] = []) {
    this.build(documents.map((document) => tokenizeToStats(document)))
  }

  /**
   * Build an index from pre-tokenized documents, skipping (re-)tokenization of
   * raw text. Document order maps 1:1 to the array passed in, so `search`
   * results' `index` addresses that same array (e.g. the persisted snapshot's
   * document list).
   */
  static fromTermFreqs(docs: TermFreqDoc[]): Bm25Index {
    const index = new Bm25Index()
    index.build(
      docs.map((doc) => ({
        termFreq: new Map(Object.entries(doc.termFreq)),
        length: doc.length,
      })),
    )
    return index
  }

  private build(docs: DocStats[]): void {
    this.docLengths = new Array<number>(docs.length)
    this.postings = new Map()
    let totalLength = 0
    docs.forEach((doc, i) => {
      this.docLengths[i] = doc.length
      totalLength += doc.length
      for (const [term, tf] of doc.termFreq) {
        let list = this.postings.get(term)
        if (!list) {
          list = []
          this.postings.set(term, list)
        }
        list.push({ doc: i, tf })
      }
    })
    this.avgDocLength = docs.length > 0 ? totalLength / docs.length : 0
  }

  /**
   * Returns documents with a positive BM25 score for the query,
   * sorted by score in descending order.
   */
  search(query: string): Bm25SearchResult[] {
    const docCount = this.docLengths.length
    if (docCount === 0) {
      return []
    }

    const queryTerms = [...new Set(tokenize(query))]
    const scores = new Map<number, number>()
    for (const term of queryTerms) {
      const list = this.postings.get(term)
      if (!list) {
        continue
      }
      const df = list.length
      const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5))
      for (const { doc, tf } of list) {
        const lengthNorm =
          1 -
          Bm25Index.B +
          Bm25Index.B *
            (this.avgDocLength > 0
              ? this.docLengths[doc] / this.avgDocLength
              : 1)
        const contribution =
          (idf * (tf * (Bm25Index.K1 + 1))) / (tf + Bm25Index.K1 * lengthNorm)
        scores.set(doc, (scores.get(doc) ?? 0) + contribution)
      }
    }

    const results: Bm25SearchResult[] = []
    for (const [index, score] of scores) {
      if (score > 0) {
        results.push({ index, score })
      }
    }
    results.sort((a, b) => b.score - a.score)
    return results
  }
}
