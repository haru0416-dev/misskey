import type { LexerConfig } from '../lexer.js'
/**
 * @param {string} code
 * @param {LexerConfig | undefined} options
 * Optional `onQuote(curr, i, code)` at `code[i] === "'"`: return length to consume from `i` (>= 1),
 * or null/undefined/below 1 for default JS single-quoted strings. No substring allocation.
 * @return {Array<[number, string]>}
 */
export function tokenize(code: string, options?: LexerConfig): Array<[number, string]>
