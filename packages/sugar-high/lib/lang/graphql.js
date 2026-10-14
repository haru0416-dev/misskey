// @ts-check
import { onCommentEnd, onCommentStart } from '../presets/hash-comment-base.js'
const keywords = new Set(
  'directive enum extend fragment implements input interface mutation on query repeatable scalar schema subscription type union'.split(
    ' '
  )
)
const typeKeywords = new Set('Boolean Float ID Int String'.split(' '))

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { keywords, typeKeywords, onCommentEnd, onCommentStart }

export default config
