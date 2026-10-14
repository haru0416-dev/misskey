// @ts-check

/** @import { TokenType } from './core.js' */
/** @import { AnnotateLine, LexerTokenType } from './lexer.js' */

const TokenTypes = /** @type {readonly LexerTokenType[]} */ (
  'identifier keyword string class property entity jsxliterals sign comment break space'.split(' ')
)
const [
  T_IDENTIFIER,
  T_KEYWORD,
  T_STRING,
  T_CLASS,
  T_PROPERTY,
  T_ENTITY,
  T_JSX_LITERALS,
  T_SIGN,
  T_COMMENT,
  T_BREAK,
  T_SPACE,
] = TokenTypes.map((_, index) => index)

// Split embedded LFs in strings/comments without re-lexing their contents.
// A trailing LF retains its empty final line; empty input has no lines.
/** @param {string} value @param {Array<[number, string]>} tokens */
function assemble(value, tokens) {
  /** @type {AnnotateLine[]} */
  const lines = []
  /** @type {Array<{type: TokenType, value: string}>} */
  let lineTokens = []
  let lineStart = 0
  let offset = 0

  // Built-in token text covers the source contiguously, so line values need no map/join pass.
  function flushLine() {
    lines.push({
      index: lines.length,
      value: lineTokens.length === 1 ? lineTokens[0].value : value.slice(lineStart, offset),
      // Compact copies avoid retaining the excess capacity of push-grown buffers.
      tokens: lineTokens.slice(),
      annotations: [],
    })
    lineTokens = []
  }

  for (let index = 0; index < tokens.length; index++) {
    const [type, text] = tokens[index]
    if (type === T_BREAK) {
      flushLine()
      offset += text.length
      lineStart = offset
      if (index === tokens.length - 1) flushLine()
      continue
    }
    const tokenType = /** @type {TokenType} */ (TokenTypes[type])
    if (!text.includes('\n')) {
      lineTokens.push({ type: tokenType, value: text })
      offset += text.length
      continue
    }
    const parts = text.split('\n')
    for (let part = 0; part < parts.length; part++) {
      lineTokens.push({ type: tokenType, value: parts[part] })
      offset += parts[part].length
      if (part < parts.length - 1) {
        flushLine()
        offset++
        lineStart = offset
      }
    }
  }
  if (lineTokens.length) flushLine()
  return { value, lines }
}

export {
  assemble,
  TokenTypes,
  T_BREAK,
  T_CLASS,
  T_COMMENT,
  T_ENTITY,
  T_IDENTIFIER,
  T_JSX_LITERALS,
  T_KEYWORD,
  T_PROPERTY,
  T_SIGN,
  T_SPACE,
  T_STRING,
}
