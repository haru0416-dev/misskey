// @ts-check
import { tokenize as tokenizeJavaScript } from '../presets/javascript-runtime.js'

/** @type {import('../lexer.js').LexerConfig['tokenize']} */
const tokenize = (code, options) =>
  tokenizeJavaScript(code, {
    ...options,
    typescript: true,
  })

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { tokenize }

export default config
