// @ts-check
import { T_IDENTIFIER } from '../shared.js'

/** @param {string} code @returns {Array<[number, string]>} */
const tokenize = code => [[T_IDENTIFIER, code]]

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { tokenize }

export default config
