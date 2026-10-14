// @ts-check
import { onCommentStart, onCommentEnd } from '../presets/clike-base.js'

// AiScript, the scripting language of Misskey. Comments are `//` and `/* */`, strings are quoted with
// ' or ", and template strings use backquotes with `{expr}` holes; a template is colored as one string.
const keywords = new Set(
  'let var if elif else return each for loop break continue match case default eval exists do while null true false'.split(
    ' '
  )
)

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = {
  keywords,
  onCommentStart,
  onCommentEnd,
  jsx: false,
  regex: false,
  templateStrings: true,
}

export default config
