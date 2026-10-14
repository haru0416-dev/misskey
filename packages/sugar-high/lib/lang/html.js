// @ts-check
import { tokenizeEmbeddedHtml } from '../presets/embedded-html.js'

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { tokenize: tokenizeEmbeddedHtml }

export default config
