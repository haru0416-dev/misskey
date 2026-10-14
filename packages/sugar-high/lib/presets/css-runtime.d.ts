import type { LexerConfig } from '../lexer.js'

export const config: LexerConfig
export function tokenize(code: string, options?: LexerConfig): Array<[number, string]>
