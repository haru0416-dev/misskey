// @ts-check
import { tokenize as tokenizePlain } from '../lexer.js'

const keywords = new Set(
  'as break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while async await dyn abstract become box do final macro override priv typeof unsized virtual yield try'.split(
    ' '
  )
)

/**
 * Rust raw strings close only at a quote followed by the opening hash count.
 * @param {string} curr
 * @param {number} index
 * @param {string} code
 */
function onLiteral(curr, index, code) {
  if (curr === "'") return charLength(index, code)
  if (curr !== 'r' && curr !== 'b' && curr !== 'c') return 0
  let quote = index
  if ((curr === 'b' || curr === 'c') && code[quote + 1] === 'r') quote++
  if (code[quote] !== 'r') return 0
  quote++
  const hashesStart = quote
  while (code[quote] === '#') quote++
  if (code[quote] !== '"') return 0
  const hashes = quote - hashesStart
  let end = quote + 1
  while (end < code.length) {
    if (code[end] !== '"') {
      end++
      continue
    }
    let closing = end + 1
    while (closing - end - 1 < hashes && code[closing] === '#') closing++
    if (closing - end - 1 === hashes) return closing - index
    // Skip a failed hash run instead of revisiting its characters.
    end = closing
  }
  return code.length - index
}

/** @param {number} index @param {string} code */
function charLength(index, code) {
  let end = index + 1
  const first = code[end]
  if (!first || first === "'" || first === '\n' || first === '\r') return 0
  if (first === '\\') {
    end++
    if (code[end] === 'x') {
      if (!/^[\da-f]{2}$/i.test(code.slice(end + 1, end + 3))) return 0
      end += 3
    } else if (code[end] === 'u' && code[end + 1] === '{') {
      end += 2
      let digits = 0
      while (end < code.length && /[\da-f_]/i.test(code[end])) {
        if (code[end] !== '_') digits++
        if (digits > 6) return 0
        end++
      }
      if (!digits || code[end] !== '}') return 0
      end++
    } else {
      if (!code[end] || !'\'"\\nrt0'.includes(code[end])) return 0
      end++
    }
  } else {
    end += (code.codePointAt(end) || 0) > 0xffff ? 2 : 1
  }
  return code[end] === "'" ? end + 1 - index : 0
}

/**
 * Comment depth and delimiter boundaries belong to one tokenization only.
 * @param {string} code
 * @param {import('../lexer.js').LexerConfig} [options]
 * @returns {Array<[number, string]>}
 */
function tokenize(code, options = {}) {
  if (!code.includes('"') && !code.includes("'") && !code.includes('//') && !code.includes('/*')) {
    return tokenizePlain(code, {
      keywords,
      onQuote,
      ...options,
      tokenize: undefined,
      onLiteral: options.onLiteral === onLiteral ? undefined : options.onLiteral,
    })
  }
  let depth = 0
  let delimiterStart = 0
  return tokenizePlain(code, {
    keywords,
    onLiteral,
    onQuote,
    ...options,
    tokenize: undefined,
    onCommentStart(curr, next, index) {
      if (curr !== '/') return 0
      if (next === '/') return 1
      if (next !== '*') return 0
      depth = 1
      delimiterStart = index + 2
      return 2
    },
    onCommentEnd(prev, curr, index, source, start) {
      if (source[start + 1] === '/') return curr === '\n' ? 1 : 0
      // Delimiters cannot overlap, including the initial opening delimiter.
      if (index - 1 < delimiterStart) return 0
      if (prev === '/' && curr === '*') {
        depth++
        delimiterStart = index + 1
      } else if (prev === '*' && curr === '/') {
        depth--
        delimiterStart = index + 1
        if (depth === 0) return 2
      }
      return 0
    },
  })
}

/**
 * Valid characters are consumed by onLiteral first; this hook handles lifetimes
 * and the remaining apostrophe fallback.
 * @param {string} curr `code[i]` (apostrophe)
 * @param {number} i
 * @param {string} code
 * @returns {number} code units to consume from `i`
 */
function onQuote(curr, i, code) {
  if (curr !== "'" || i + 1 >= code.length) return 1
  const n1 = code[i + 1]
  if (n1 === '\\') {
    let j = i + 2
    while (j < code.length) {
      if (code[j] === '\\') {
        j += 2
        continue
      }
      if (code[j] === "'") return j - i + 1
      j++
    }
    return code.length - i
  }
  if (n1 === '_') {
    return 2
  }
  if (/[a-zA-Z]/.test(n1)) {
    let j = i + 2
    while (j < code.length && /[a-zA-Z0-9_]/.test(code[j])) j++
    if (j < code.length && code[j] === "'") {
      return j - i + 1
    }
    return j - i
  }
  return 1
}

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { keywords, onLiteral, tokenize, onQuote }

export default config
