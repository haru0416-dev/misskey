export type TokenType =
  | 'identifier'
  | 'keyword'
  | 'string'
  | 'class'
  | 'property'
  | 'entity'
  | 'jsxliterals'
  | 'sign'
  | 'comment'
  | 'space'

export type ParsedToken = {
  readonly type: TokenType
  readonly value: string
}

export type ParsedLine = {
  readonly index: number
  readonly value: string
  readonly tokens: readonly ParsedToken[]
  readonly annotations: readonly string[]
}

export type ParsedCode = {
  readonly value: string
  readonly lines: readonly ParsedLine[]
}

declare const languageConfig: unique symbol

/** Shared, read-only built-in configuration. Import one from sugar-high/lang/<id>. */
export type LanguageConfig = {
  readonly [languageConfig]: true
}

export function parse(code: string, config: LanguageConfig): ParsedCode
