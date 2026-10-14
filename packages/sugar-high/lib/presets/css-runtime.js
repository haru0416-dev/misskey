// @ts-check
import {
  T_BREAK,
  T_CLASS,
  T_COMMENT,
  T_IDENTIFIER,
  T_PROPERTY,
  T_SIGN,
  T_SPACE,
} from '../shared.js'
import { tokenize as tokenizePlain } from '../lexer.js'

const keywords = new Set(
  '@media @import @keyframes @font-face @supports @page @counter-style @font-feature-values @viewport @counter-style @font-feature-values @document'.split(
    ' '
  )
)

const onCommentStart = (currentChar, nextChar) => {
  return '/*' === currentChar + nextChar ? 1 : 0
}

const onCommentEnd = (prevChar, currChar) => {
  return '*/' === prevChar + currChar ? 1 : 0
}

const onLiteral = (curr, index, code) => {
  if (curr !== '#') return 0
  return (
    code
      .slice(index, index + 10)
      .match(/^#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w-])/i)?.[0].length || 0
  )
}

const isIgnored = type => type === T_SPACE || type === T_BREAK || type === T_COMMENT
const isPropertyPart = ([type, value]) =>
  type === T_IDENTIFIER || type === T_CLASS || (type === T_SIGN && value === '-')
const isNamePart = ([type]) => type === T_IDENTIFIER || type === T_CLASS || type === T_PROPERTY
const isNameStart = token => isNamePart(token) && !/^\d/.test(token[1])
const isHyphen = ([type, value]) => type === T_SIGN && value === '-'

/**
 * Rejoin CSS dashed identifiers split by the shared punctuation lexer.
 * @param {Array<[number, string]>} tokens
 */
const mergeDashedNames = tokens => {
  let read = 0
  let write = 0
  while (read < tokens.length) {
    const start = read
    let firstWord = read

    if (isHyphen(tokens[read])) {
      while (tokens[read] && isHyphen(tokens[read])) read++
      if (!tokens[read] || !isNameStart(tokens[read])) {
        for (let index = start; index < read; index++) tokens[write++] = tokens[index]
        continue
      }
      firstWord = read++
    } else if (isNameStart(tokens[read])) {
      read++
    } else {
      tokens[write++] = tokens[read++]
      continue
    }

    let dashed = firstWord > start
    let nameEnd = read
    while (tokens[read] && isHyphen(tokens[read])) {
      while (tokens[read] && isHyphen(tokens[read])) read++
      if (!tokens[read] || !isNamePart(tokens[read])) break
      dashed = true
      nameEnd = ++read
    }

    if (dashed) {
      const type = tokens[firstWord][0]
      let name = ''
      for (let index = start; index < nameEnd; index++) name += tokens[index][1]
      tokens[write++] = [type, name]
    } else {
      tokens[write++] = tokens[start]
    }
    // A failed trailing run stays separate; its following token is reconsidered.
    while (nameEnd < read) tokens[write++] = tokens[nameEnd++]
  }
  tokens.length = write
}

/** Index colons followed by `{` before `;` or `}` at matching parenthesis/bracket depth. */
const findBlockColons = tokens => {
  let parentheses = 0
  let brackets = 0
  for (const [type, value] of tokens) {
    if (type !== T_SIGN) continue
    if (value === '(') parentheses++
    else if (value === ')') parentheses--
    else if (value === '[') brackets++
    else if (value === ']') brackets--
  }

  const blockColons = new Set()
  const nextDelimiters = new Map()
  for (let index = tokens.length - 1; index >= 0; index--) {
    const [type, value] = tokens[index]
    if (type !== T_SIGN) continue
    if (value === '(') parentheses--
    else if (value === ')') parentheses++
    else if (value === '[') brackets--
    else if (value === ']') brackets++
    else if (value === ':' || value === '{' || value === ';' || value === '}') {
      // Keep unmatched/negative depths too: semicolons do not reset depth.
      const depth = `${parentheses},${brackets}`
      if (value === ':') {
        if (nextDelimiters.get(depth) === '{') blockColons.add(index)
      } else {
        nextDelimiters.set(depth, value)
      }
    }
  }
  return blockColons
}

/**
 * Add CSS declaration context after the shared plain lexer runs.
 * @param {string} code
 * @param {import('../lexer.js').LexerConfig} [options]
 */
export const tokenize = (code, options) => {
  const tokens = tokenizePlain(code, { ...options, tokenize: undefined })
  mergeDashedNames(tokens)
  const blockColons = findBlockColons(tokens)
  let write = 0
  let blockDepth = 0
  let declarationStart = false

  for (let index = 0; index < tokens.length; index++) {
    const [type, value] = tokens[index]
    tokens[write++] = tokens[index]

    if (type === T_SIGN && value === '{') {
      blockDepth++
      declarationStart = true
      continue
    }
    if (type === T_SIGN && value === '}') {
      blockDepth--
      declarationStart = false
      continue
    }
    if (type === T_SIGN && value === ';') {
      declarationStart = blockDepth > 0
      continue
    }
    if (!declarationStart || isIgnored(type)) continue

    const propertyStart = index
    let propertyEnd = index
    while (propertyEnd < tokens.length && isPropertyPart(tokens[propertyEnd])) {
      propertyEnd++
    }
    let colon = propertyEnd
    while (colon < tokens.length && isIgnored(tokens[colon][0])) colon++

    if (
      propertyEnd > propertyStart &&
      tokens[colon]?.[0] === T_SIGN &&
      tokens[colon][1] === ':' &&
      !blockColons.has(colon)
    ) {
      let property = ''
      for (let part = propertyStart; part < propertyEnd; part++) property += tokens[part][1]
      tokens[write - 1] = [T_PROPERTY, property]
      index = propertyEnd - 1
    }
    declarationStart = false
  }

  tokens.length = write
  return tokens
}

/** @satisfies {import('../lexer.js').LexerConfig} */
export const config = { keywords, onCommentStart, onCommentEnd, onLiteral, tokenize }
