import type { TokenType } from './core.js'

export type LexerTokenType = TokenType | 'break'

export type AnnotateLine = {
  readonly index: number
  readonly value: string
  readonly tokens: readonly { type: TokenType; value: string }[]
  annotations: string[]
}

/** Internal rules; built-in language handles do not expose these extension points. */
export type LexerConfig = {
  readonly keywords?: Set<string>
  readonly typeKeywords?: Set<string>
  readonly onCommentStart?: (curr: string, next: string, index: number, code: string) => number
  readonly onCommentEnd?: (
    prev: string,
    curr: string,
    index: number,
    code: string,
    start: number
  ) => number
  readonly onLiteral?: (curr: string, index: number, code: string) => number | null | undefined
  /** Length of an object key starting at `index`, emitted as one property token. */
  readonly onKey?: (curr: string, index: number, code: string) => number | null | undefined
  readonly onQuote?: (curr: string, index: number, code: string) => number | null | undefined
  readonly quotedKeys?: boolean
  /** Unquoted words followed by `:` are object keys (JSON5). */
  readonly bareKeys?: boolean
  readonly jsx?: boolean
  readonly regex?: boolean
  readonly templateStrings?: boolean
  readonly caseInsensitive?: boolean
  readonly typescript?: boolean
  readonly tokenize?: (code: string, config: LexerConfig) => Array<[number, string]>
  readonly annotateLine?: (
    line: AnnotateLine,
    parsed: { readonly value: string; readonly lines: readonly AnnotateLine[] }
  ) => void
}

export function tokenize(code: string, config?: LexerConfig): Array<[number, string]>
