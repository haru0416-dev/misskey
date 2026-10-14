// @ts-check

import { onCommentEnd, onCommentStart } from '../presets/clike-base.js'

const keywords = new Set('true false null'.split(' '))
const quotedKeys = true
// JSON5 keys may be unquoted; strict JSON never has a bare word before `:`, so one preset serves both.
const bareKeys = true
// JSONC and JSON5 are treated as dialects of JSON rather than separate languages.

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { keywords, quotedKeys, bareKeys, onCommentEnd, onCommentStart }

export default config
