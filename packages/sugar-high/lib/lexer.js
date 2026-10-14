// @ts-check

import {
  T_BREAK,
  T_CLASS,
  T_COMMENT,
  T_IDENTIFIER,
  T_KEYWORD,
  T_PROPERTY,
  T_SIGN,
  T_SPACE,
  T_STRING,
} from './shared.js'

/** @import { LexerConfig } from './lexer.js' */

const signs = new Set('+-*/%=!&|^~?:.,;()[]{}<>#@\\')
const noComment = () => 0
/** @param {string} value */
const identityWord = value => value
/** @param {string} value */
const lowercaseWord = value => value.toLowerCase()

const unicodeWord = /[\p{L}\p{N}]/u
const unicodeUpper = /^\p{Lu}/u
const unicodeSpace = /[^\S\r\n]/

/** @param {string} source @param {number} index */
function isWordAt(source, index) {
  const code = source.charCodeAt(index)
  // ASCII case pairs differ by bit 0x20; folding avoids case-converted strings.
  const lower = code | 32
  return (
    code === 95 ||
    code === 36 ||
    (code >= 48 && code <= 57) ||
    (lower >= 97 && lower <= 122) ||
    (code >= 128 && unicodeWord.test(source[index]))
  )
}

/** @param {string} value */
function isDigit(value) {
  const code = value?.charCodeAt(0)
  return code >= 48 && code <= 57
}

/** @param {string} value */
function isSpace(value) {
  const code = value?.charCodeAt(0)
  return (
    code === 32 ||
    code === 9 ||
    code === 11 ||
    code === 12 ||
    (code >= 128 && unicodeSpace.test(value))
  )
}

/** @param {string} value */
function isClass(value) {
  const code = value.charCodeAt(0)
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    value === 'null' ||
    (code >= 128 && unicodeUpper.test(value))
  )
}

// Fraction and signed exponent belong to the literal; word characters after it (`1.5em`, `10u8`) are a suffix.
const numberLiteral =
  /0[xX][\da-fA-F_]+|0[bBoO][\d_]+|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?/y

/**
 * End of the number literal starting at `index`, or 0. A digit right after a member dot
 * (`tuple.0`) stays a property, and `.5` is a number only where an operand can start.
 * @param {string} code @param {number} index
 */
function numberLiteralEnd(code, index) {
  const curr = code[index]
  const prev = code[index - 1]
  if (curr === '.') {
    if (!isDigit(code[index + 1])) return 0
    if (prev !== undefined && (isWordAt(code, index - 1) || ').]'.includes(prev))) return 0
  } else if (!isDigit(curr) || prev === '.') {
    return 0
  }
  numberLiteral.lastIndex = index
  if (!numberLiteral.test(code)) return 0
  let end = numberLiteral.lastIndex
  while (end < code.length && isWordAt(code, end)) end++
  return end
}

/** @param {string} code @param {number} index */
function isQuotedKey(code, index) {
  while (index < code.length && /\s/.test(code[index])) index++
  return code[index] === ':'
}

/**
 * General-purpose lexer for keyword, string, comment, and punctuation based languages.
 * Complex language presets may supply `tokenize` to replace this stage.
 * @param {string} code
 * @param {LexerConfig | undefined} options
 * @returns {Array<[number, string]>}
 */
function tokenize(code, options) {
  if (typeof options?.tokenize === 'function') return options.tokenize(code, options)

  const keywords = options?.keywords
  const typeKeywords = options?.typeKeywords
  const onCommentStart = options?.onCommentStart || noComment
  const onCommentEnd = options?.onCommentEnd || noComment
  // Resolve read-only configuration once; literal/quote hooks still receive it as `this`.
  const onLiteral = options?.onLiteral
  const onKey = options?.onKey
  const onQuote = options?.onQuote
  const quotedKeys = options?.quotedKeys
  const bareKeys = options?.bareKeys
  const templateStrings = options?.templateStrings
  const normalize = options?.caseInsensitive ? lowercaseWord : identityWord
  /** @type {Array<[number, string]>} */
  const tokens = []
  let lastSignificant = ''

  /** @param {number} type @param {string} value */
  function append(type, value) {
    if (!value) return
    tokens.push([type, value])
    if (type !== T_SPACE && type !== T_BREAK) lastSignificant = value
  }

  for (let i = 0; i < code.length;) {
    const curr = code[i]
    const next = code[i + 1]

    const commentType = onCommentStart(curr, next, i, code)
    if (commentType) {
      const start = i++
      while (i < code.length) {
        if (onCommentEnd(code[i - 1], code[i], i, code, start) === commentType) {
          i++
          break
        }
        i++
      }
      append(T_COMMENT, code.slice(start, i))
      continue
    }

    const literalLength = onLiteral?.call(options, curr, i, code)
    if (literalLength) {
      append(T_STRING, code.slice(i, i + literalLength))
      i += literalLength
      continue
    }

    const keyLength = onKey?.call(options, curr, i, code)
    if (keyLength) {
      append(T_PROPERTY, code.slice(i, i + keyLength))
      i += keyLength
      continue
    }

    if (typeof onQuote === 'function' && curr === "'") {
      const length = onQuote.call(options, curr, i, code)
      if (typeof length === 'number' && length >= 1) {
        append(T_IDENTIFIER, code.slice(i, i + length))
        i += length
        continue
      }
    }

    if (curr === '"' || curr === "'" || (templateStrings && curr === '`')) {
      const quote = curr
      const start = i++
      while (i < code.length) {
        if (code[i] === '\\') {
          i++
        } else if (code[i] === quote) {
          i++
          break
        }
        i++
      }
      const value = code.slice(start, i)
      append(quotedKeys && isQuotedKey(code, i) ? T_PROPERTY : T_STRING, value)
      continue
    }

    if (curr === '\n') {
      append(T_BREAK, curr)
      i++
      continue
    }

    if (isSpace(curr)) {
      const start = i++
      while (i < code.length && isSpace(code[i])) i++
      append(T_SPACE, code.slice(start, i))
      continue
    }

    const numberEnd = numberLiteralEnd(code, i)
    if (numberEnd) {
      append(T_CLASS, code.slice(i, numberEnd))
      i = numberEnd
      continue
    }

    if (isWordAt(code, i)) {
      const start = i++
      while (i < code.length && isWordAt(code, i)) i++
      const value = code.slice(start, i)
      const normalized = normalize(value)
      const type =
        bareKeys && isQuotedKey(code, i)
          ? T_PROPERTY
          : typeKeywords?.has(normalized)
            ? T_CLASS
            : keywords?.has(normalized)
              ? T_KEYWORD
              : lastSignificant === '.'
                ? T_PROPERTY
                : isClass(value)
                  ? T_CLASS
                  : T_IDENTIFIER
      append(type, value)
      continue
    }

    if (signs.has(curr)) {
      append(T_SIGN, curr)
      i++
      continue
    }

    append(T_STRING, curr)
    i++
  }

  return tokens
}

export { tokenize }
