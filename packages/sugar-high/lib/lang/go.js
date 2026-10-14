// @ts-check
import { onCommentStart, onCommentEnd } from '../presets/clike-base.js'

const typeKeywords = new Set(
  'bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr'.split(
    ' '
  )
)

const keywords = new Set(
  'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'.split(
    ' '
  )
)

/** @param {string} curr @param {number} index @param {string} code */
function onLiteral(curr, index, code) {
  if (curr !== '`') return 0
  const end = code.indexOf('`', index + 1)
  return (end === -1 ? code.length : end + 1) - index
}

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { typeKeywords, keywords, onLiteral, onCommentStart, onCommentEnd }

export default config
