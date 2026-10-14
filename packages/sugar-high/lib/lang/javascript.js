// @ts-check
import { tokenize as tokenizeJavaScript } from '../presets/javascript-runtime.js'

// JavaScript includes JSX and preserves the lightweight TypeScript heuristic used by the default
// highlighter. Use the TypeScript preset to force TS/TSX behavior for ambiguous snippets.
const tokenize = tokenizeJavaScript

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { tokenize }

export default config
