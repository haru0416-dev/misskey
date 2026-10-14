// @ts-check
import { onCommentEnd, onCommentStart } from '../presets/hash-comment-base.js'
const keywords = new Set('false true'.split(' '))
const quotedKeys = true

/** @param {string} curr @param {number} index @param {string} code */
function onLiteral(curr, index, code) {
  if (curr !== '"' && curr !== "'") return 0
  const multiline = code[index + 1] === curr && code[index + 2] === curr
  let end = index + (multiline ? 3 : 1)

  while (end < code.length) {
    const char = code[end]
    if (!multiline && (char === '\n' || char === '\r')) break
    if (curr === '"' && char === '\\') {
      end++
      if (end < code.length && (multiline || (code[end] !== '\n' && code[end] !== '\r'))) end++
    } else if (char === curr) {
      if (!multiline) return end + 1 - index
      let width = 1
      // Up to two quotes can belong to the body immediately before the delimiter.
      while (width < 5 && code[end + width] === curr) width++
      if (width >= 3) return end + width - index
      end += width
    } else {
      end++
    }
  }

  return end - index
}

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { keywords, quotedKeys, onCommentEnd, onCommentStart, onLiteral }

export default config
