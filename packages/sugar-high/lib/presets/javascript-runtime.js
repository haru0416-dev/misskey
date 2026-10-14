// @ts-check

import {
  T_BREAK,
  T_CLASS as T_CLS_NUMBER,
  T_COMMENT,
  T_ENTITY,
  T_IDENTIFIER,
  T_JSX_LITERALS,
  T_KEYWORD,
  T_PROPERTY,
  T_SIGN,
  T_SPACE,
  T_STRING,
} from '../shared.js'

/** @import { LexerConfig } from '../lexer.js' */

const JSXBrackets = new Set('<>{}[]')
const javascriptWords =
  'for do while if else return function var let const true false undefined this new delete typeof in instanceof void break continue switch case default throw try catch finally debugger with yield async await class extends super import export from static'
const Keywords_Js = new Set(javascriptWords.split(' '))
const Keywords_Ts = new Set(
  `${javascriptWords} type interface enum implements readonly abstract declare namespace module private protected public override keyof infer is asserts satisfies as unknown never any number string boolean bigint symbol object`.split(
    ' '
  )
)
const RegexExpressionKeywords = new Set(
  'return throw case yield await typeof void delete new in instanceof else do'.split(' ')
)
const ControlConditionKeywords = new Set('if while for with switch catch'.split(' '))

const Signs = new Set('+-*/%=!&|^~?:.,;\'"()[]#@\\<>{}')

const DefaultOptions = {
  keywords: Keywords_Js,
  onCommentStart: isCommentStart_Js,
  onCommentEnd: isCommentEnd_Js,
  jsx: true,
  regex: true,
  templateStrings: true,
}

/**
 * Apply caller overrides to the JavaScript-compatible defaults.
 * @param {LexerConfig | undefined} options
 * @returns {LexerConfig}
 */
function resolveLexerConfig(options) {
  return {
    ...DefaultOptions,
    ...options,
  }
}

/**
 * Fast, heuristic TS detection. It intentionally prefers speed over full parsing.
 * @param {string} code
 * @returns {boolean}
 */
function isLikelyTypeScript(code) {
  // Each declaration alone reaches the threshold; stop before scanning the other patterns.
  if (/\binterface\s+[A-Za-z_$][\w$]*/.test(code)) return true
  if (/\btype\s+[A-Za-z_$][\w$]*\s*=/.test(code)) return true
  if (/\benum\s+[A-Za-z_$][\w$]*/.test(code)) return true
  if (/\b(?:implements|readonly|declare|namespace|satisfies|infer|keyof|asserts)\b/.test(code))
    return true
  if (!code.includes(':')) return false

  let score = /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*:\s*/.test(code) ? 1 : 0
  let matched = 0
  // Match the two annotation patterns backwards. Bits 1 and 2 carry the
  // comma/assignment and return-signature suffixes respectively. In particular,
  // an unclosed `<...` is inspected once, not once for every preceding `:Name`.
  let whitespaceEnd = 0
  let whitespaceEnd2 = 0
  let afterType = 0
  let typeTail = 0
  let genericClose = 0
  let genericBody = 0
  let wordTail = 0
  let whitespaceIdentifier = 0
  let whitespaceColon = 0
  for (let i = code.length - 1; i >= 0; i--) {
    const ch = code[i]
    const space = isWhitespace(ch)
    const end =
      (ch === ',' || ch === ')' || ch === '=' || ch === ';' || ch === '{' ? 1 : 0) |
      (ch === '{' || (ch === '=' && code[i + 1] === '>') ? 2 : 0)
    const nextWhitespaceEnd = end | (space ? whitespaceEnd : 0)
    const nextAfterType =
      nextWhitespaceEnd | (ch === '[' && code[i + 1] === ']' ? whitespaceEnd2 : 0)
    const nextGenericClose = ch === '>' ? afterType : 0
    const nextGenericBody = ch !== '>' && ch !== '\n' ? genericClose | genericBody : 0
    const nextTypeTail = nextAfterType | (ch === '<' ? genericBody : 0)
    const nextWordTail = isAsciiWord(ch.charCodeAt(0)) ? typeTail | wordTail : 0
    const identifier = isAsciiIdentifierStart(ch.charCodeAt(0)) ? typeTail | wordTail : 0
    const nextWhitespaceIdentifier = identifier | (space ? whitespaceIdentifier : 0)
    const colon = ch === ':' ? whitespaceIdentifier : 0
    const found = (colon & 1) | (ch === ')' ? whitespaceColon & 2 : 0)
    const fresh = found & ~matched
    if (fresh) {
      matched |= fresh
      score += (fresh & 1) + ((fresh >> 1) & 1)
      if (score >= 2) return true
    }
    whitespaceColon = colon | (space ? whitespaceColon : 0)
    whitespaceIdentifier = nextWhitespaceIdentifier
    wordTail = nextWordTail
    genericBody = nextGenericBody
    genericClose = nextGenericClose
    afterType = nextAfterType
    typeTail = nextTypeTail
    whitespaceEnd2 = whitespaceEnd
    whitespaceEnd = nextWhitespaceEnd
  }
  return false
}

/**
 * @param {string} code
 * @param {number} index
 */
function skipTypeTrivia(code, index) {
  while (index < code.length) {
    if (isWhitespace(code[index])) {
      index++
    } else if (code[index] === '/' && code[index + 1] === '/') {
      index += 2
      while (index < code.length && code[index] !== '\n') index++
    } else if (code[index] === '/' && code[index + 1] === '*') {
      index += 2
      while (index < code.length && !(code[index] === '*' && code[index + 1] === '/')) index++
      index = Math.min(index + 2, code.length)
    } else {
      break
    }
  }
  return index
}

/**
 * @param {string} code
 * @param {number} index
 */
function findTypeQuoteEnd(code, index) {
  const quote = code[index]
  for (let i = index + 1; i < code.length; i++) {
    const ch = code[i]
    if (ch === quote) return i
    if (quote !== '`' && (ch === '\n' || ch === '\r')) return -1
    if (ch === '\\') i++
  }
  return -1
}

/**
 * Balance type delimiters, or JavaScript parameter delimiters without treating
 * comparison operators as type arguments. Cached group ends let nested generic
 * arrows reuse the outer lookahead instead of rescanning their parameter tails.
 * @param {string} code
 * @param {number} startIndex
 * @param {boolean} angles
 * @param {Map<number, number>} ends
 * @param {(start: number) => number} findRegexClose
 */
function findTypeGroupEnd(code, startIndex, angles, ends, findRegexClose) {
  const cached = ends.get(startIndex)
  if (cached !== undefined) return cached
  const openings = [startIndex]
  let previous = startIndex
  for (let i = startIndex + 1; i < code.length; i++) {
    const ch = code[i]
    if (isWhitespace(ch)) continue
    if (ch === '"' || ch === "'" || ch === '`') {
      i = findTypeQuoteEnd(code, i)
      if (i < 0) return -1
      previous = i
      continue
    }
    if (ch === '/' && (code[i + 1] === '/' || code[i + 1] === '*')) {
      i = skipTypeTrivia(code, i) - 1
      continue
    }
    if (angles && ch === '/') return -1
    if (!angles && ch === '/') {
      let wordStart = previous
      while (
        wordStart >= startIndex &&
        isWordCode(code.charCodeAt(wordStart)) &&
        previous - wordStart < 10
      )
        wordStart--
      const expressionKeyword =
        previous - wordStart <= 10 &&
        RegexExpressionKeywords.has(code.slice(wordStart + 1, previous + 1))
      if ('([{,:;=!?&|+*-~%^<>'.includes(code[previous]) || expressionKeyword) {
        const close = findRegexClose(i)
        if (close >= 0) {
          i = close
          previous = i
          continue
        }
      }
    }
    if (ch === '(' || ch === '[' || ch === '{' || (angles && ch === '<')) {
      const groupEnd = ends.get(i)
      if (groupEnd !== undefined) i = groupEnd
      else openings.push(i)
      previous = i
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}' || (angles && ch === '>' && code[i - 1] !== '=')) {
      const open = openings[openings.length - 1]
      const expected =
        code[open] === '(' ? ')' : code[open] === '[' ? ']' : code[open] === '{' ? '}' : '>'
      if (ch !== expected) return -1
      openings.pop()
      ends.set(open, i)
      if (!openings.length) return i
    } else if (angles && openings.length === 1 && ch === ';') {
      return -1
    }
    previous = i
  }
  return -1
}

/**
 * Find a balanced `<T extends ...>(...) =>` header without a length limit.
 * Return the closing type-list offset only when its following signature is an
 * arrow, leaving ordinary TSX tags to the tag lexer.
 * @param {string} code
 * @param {number} startIndex
 * @param {Map<number, number>} ends
 * @param {(start: number) => number} findRegexClose
 */
function findTypeParameterListEnd(code, startIndex, ends, findRegexClose) {
  if (code[startIndex] !== '<') return -1
  const first = skipTypeTrivia(code, startIndex + 1)
  if (!isIdentifierChar(code[first])) return -1
  const typeEnd = findTypeGroupEnd(code, startIndex, true, ends, findRegexClose)
  if (typeEnd < 0) return -1
  let next = skipTypeTrivia(code, typeEnd + 1)
  if (code[next] !== '(') return -1
  const parameterEnd = findTypeGroupEnd(code, next, false, ends, findRegexClose)
  if (parameterEnd < 0) return -1
  next = skipTypeTrivia(code, parameterEnd + 1)
  if (code[next] === '=' && code[next + 1] === '>') return typeEnd
  if (code[next] !== ':') return -1

  for (let i = next + 1; i < code.length; i++) {
    i = skipTypeTrivia(code, i)
    const ch = code[i]
    if (ch === '=' && code[i + 1] === '>') return typeEnd
    if (ch === '"' || ch === "'" || ch === '`') {
      i = findTypeQuoteEnd(code, i)
      if (i < 0) return -1
    } else if (ch === '(' || ch === '[' || ch === '{' || ch === '<') {
      i = findTypeGroupEnd(code, i, true, ends, findRegexClose)
      if (i < 0) return -1
    } else if (ch === ';' || ch === ')' || ch === '}' || ch === '=' || ch === '/') {
      return -1
    }
  }
  return -1
}

// No global flag: reuse the matcher without lastIndex state or per-token RegExp allocation.
const whitespace = /^[^\S\r\n]+$/

function isSpaces(str) {
  return whitespace.test(str)
}

function isSign(ch) {
  return Signs.has(ch)
}

function isSigns(str) {
  for (let i = 0; i < str.length; i++) {
    if (!isSign(str[i])) return false
  }
  return true
}

function isAsciiAlpha(code) {
  // ASCII case pairs differ by bit 0x20; folding avoids case-converted strings.
  code |= 32
  return code >= 97 && code <= 122
}

function isAsciiIdentifierStart(code) {
  return code === 36 || code === 95 || isAsciiAlpha(code)
}

function isAsciiWord(code) {
  return (code >= 48 && code <= 57) || isAsciiIdentifierStart(code)
}

// Fraction and signed exponent belong to the literal; word characters after it (`10n`) are a suffix.
const numberLiteral =
  /0[xX][\da-fA-F_]+|0[bBoO][\d_]+|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?/y

/**
 * End of the number literal starting at `index`, or 0. `.5` is a number only where an operand
 * can start, not after a member or call (`a.b`, `f().x`).
 * @param {string} code @param {number} index
 */
function numberLiteralEnd(code, index) {
  const curr = code.charCodeAt(index)
  const prev = code[index - 1]
  if (curr === 46) {
    const next = code.charCodeAt(index + 1)
    if (!(next >= 48 && next <= 57)) return 0
    if (prev !== undefined && (isWordCode(prev.charCodeAt(0)) || ').]'.includes(prev))) return 0
  } else if (!(curr >= 48 && curr <= 57) || prev === '.') {
    return 0
  }
  numberLiteral.lastIndex = index
  if (!numberLiteral.test(code)) return 0
  let end = numberLiteral.lastIndex
  while (end < code.length && isWordCode(code.charCodeAt(end))) end++
  return end
}

function isWordCode(code) {
  return code >= 128 || isAsciiWord(code)
}

function isWord(chr) {
  if (!chr) return false
  for (let i = 0; i < chr.length; i++) {
    if (!isWordCode(chr.charCodeAt(i))) return false
  }
  return true
}

function isCls(str) {
  const first = str.charCodeAt(0)
  return (
    (first >= 48 && first <= 57) ||
    (first >= 65 && first <= 90) ||
    (first >= 128 && /^\p{Lu}/u.test(str)) ||
    str === 'null'
  )
}

function isAlpha(chr) {
  return typeof chr === 'string' && chr.length === 1 && isAsciiAlpha(chr.charCodeAt(0))
}

function isIdentifierChar(chr) {
  if (!chr || chr.length !== 1) return false
  const code = chr.charCodeAt(0)
  return code >= 128 || isAsciiIdentifierStart(code)
}

function isWhitespace(chr) {
  const code = chr?.charCodeAt(0)
  return code === 32 || (code >= 9 && code <= 13) || (code >= 128 && /\s/.test(chr))
}

function isSpaceChar(chr) {
  return chr !== '\r' && chr !== '\n' && isWhitespace(chr)
}

function isIdentifier(str) {
  return isIdentifierChar(str[0]) && isWord(str)
}

function isStrTemplateChr(chr) {
  return chr === '`'
}

function isSingleQuotes(chr) {
  return chr === '"' || chr === "'"
}

/** @returns {0|1|2}  */
function isCommentStart_Js(curr, next) {
  if (curr !== '/') return 0
  return next === '*' ? 2 : next === '/' ? 1 : 0
}

/** @returns {0|1|2}  */
function isCommentEnd_Js(prev, curr) {
  return prev === '*' && curr === '/' ? 2 : curr === '\n' ? 1 : 0
}

function isRegexStart(curr, next) {
  return curr === '/' && !isCommentStart_Js(curr, next)
}

function isPropertyKey(code, quoteEnd) {
  let i = quoteEnd + 1
  while (i < code.length && isWhitespace(code[i])) i++
  return code[i] === ':'
}

/**
 * JS, TS, and JSX share one scanner; balanced lookahead distinguishes types from tags.
 * A positive onQuote length emits an identifier; other results use ordinary string parsing.
 * @param {string} code
 * @param {LexerConfig | undefined} options
 * @returns {Array<[number, string]>}
 */
function tokenize(code, options) {
  const mergedOptions = resolveLexerConfig(options)
  const hasCustomKeywords = mergedOptions.keywords !== DefaultOptions.keywords
  const isTs =
    typeof mergedOptions.typescript === 'boolean'
      ? mergedOptions.typescript
      : isLikelyTypeScript(code)
  const resolvedKeywords = hasCustomKeywords
    ? mergedOptions.keywords
    : isTs
      ? Keywords_Ts
      : Keywords_Js

  const { onCommentStart, onCommentEnd } = mergedOptions

  const resolvedTypeKeywords =
    mergedOptions.typeKeywords instanceof Set ? mergedOptions.typeKeywords : null
  const supportsJsx = mergedOptions.jsx !== false
  const supportsRegex = mergedOptions.regex !== false
  const supportsTemplateStrings = mergedOptions.templateStrings !== false
  const normalizeKeyword = mergedOptions.caseInsensitive
    ? token => token.toLowerCase()
    : token => token
  const isTemplateQuote = chr => supportsTemplateStrings && isStrTemplateChr(chr)

  let current = ''
  // Track the pending token's boundary properties without indexing its growing rope.
  let currentLastIsWord = false
  let currentIsSpaces = false
  const setCurrent = value => {
    current = value
    currentLastIsWord = typeof value === 'string' && isWordCode(value.charCodeAt(value.length - 1))
    currentIsSpaces = isSpaces(value)
  }
  const addCurrent = value => {
    if (typeof value !== 'string') value = String(value)
    if (!value) return
    currentIsSpaces =
      (!current || currentIsSpaces) && (value.length === 1 ? isSpaceChar(value) : isSpaces(value))
    currentLastIsWord = isWordCode(value.charCodeAt(value.length - 1))
    current += value
  }

  let failedRegexBegin = 0
  let failedRegexEnd = 0
  /** @type {Int32Array | null} */
  let failedRegexEnds = null
  const cacheFailedRegex = (begin, end) => {
    failedRegexBegin = begin
    failedRegexEnd = end
    failedRegexEnds = new Int32Array(end - begin)
    // Only the outside-class result needs lookup storage. The two class states
    // at j+1 and j+2 suffice while constructing the suffix table backwards.
    let outside = -1
    let inside = -1
    let outside2 = -1
    let inside2 = -1
    for (let j = end - 1; j >= begin; j--) {
      const ch = code[j]
      let nextOutside = outside
      let nextInside = inside
      if (ch === '\n' || (ch === '\\' && code[j + 1] === '\n')) {
        nextOutside = nextInside = -1
      } else if (ch === '\\') {
        nextOutside = outside2
        nextInside = inside2
      } else if (ch === '[') {
        nextOutside = nextInside = inside
      } else if (ch === ']') {
        nextOutside = nextInside = outside
      } else if (ch === '/') {
        nextOutside = j
      }
      failedRegexEnds[j - begin] = nextOutside
      outside2 = outside
      inside2 = inside
      outside = nextOutside
      inside = nextInside
    }
  }
  const findRegexClose = start => {
    let index = start + 1
    if (failedRegexEnds && index >= failedRegexBegin && index < failedRegexEnd) {
      return failedRegexEnds[index - failedRegexBegin]
    }
    // `/` is literal inside regex character classes, e.g. `[/]`.
    let inCharClass = false
    for (; index < code.length && code[index] !== '\n'; index++) {
      const ch = code[index]
      if (ch === '\\') {
        if (code[index + 1] === '\n') break
        index++
        continue
      }
      if (ch === '[') inCharClass = true
      if (ch === ']') inCharClass = false
      if (ch === '/' && !inCharClass) return index
    }
    cacheFailedRegex(start + 1, Math.min(index + 1, code.length))
    return -1
  }
  let type = -1
  /** @type {[number, string]} */
  let last = [-1, '']
  /** @type {[number, string]} */
  let beforeLast = [-2, '']
  /** @type {Array<[number, string]>} */
  const tokens = []
  let genericTypeParameterEnd = -1
  /** @type {Map<number, number> | null} */
  let typeDelimiterEnds = null
  /** @type {boolean[] | null} */
  let controlParentheses = null
  let previousSyntaxType = -1
  let previousSyntaxToken = ''
  let regexAllowed = true

  /**
   * Tag-kind hints alone do not activate JSX: `<` can also belong to a string or type.
   * This gate enables tag/child scanning only after generic and type-argument checks.
   * @type {boolean}
   */
  let __jsxEnter = false
  /** @type {0 | 1 | 2} 0 = none; 1 = inside `<open`; 2 = inside `</close` */
  let __jsxTag = 0
  // Braced child expressions and braced attribute values use separate depth counters.
  let __jsxExprDepth = 0
  let __jsxTagExpr = 0

  /** Nested `<open>…</open>` depth (content between tags, including nested elements). */
  let __jsxStack = 0

  const __jsxChild = () => __jsxEnter && !__jsxExprDepth && !__jsxTag
  const inJsxTag = () => __jsxTag
  const inJsxLiterals = () => __jsxChild() && __jsxStack

  /** @type {string | null} */
  let __strQuote = null
  let __strTokenStart = 0
  // Equal template/interpolation depths mean JS expression mode; extra quote depth means text.
  let __strTemplateExprStack = 0
  let __strTemplateQuoteStack = 0
  const inStringQuotes = () => __strQuote !== null
  const inStrTemplateLiterals = () => __strTemplateQuoteStack > __strTemplateExprStack
  const inStrTemplateExpr = () =>
    __strTemplateQuoteStack > 0 && __strTemplateQuoteStack === __strTemplateExprStack
  const inStringContent = () => inStringQuotes() || inStrTemplateLiterals()

  /**
   * @param {string} token
   * @returns {number}
   */
  function classify(token) {
    const isLineBreak = token === '\n'
    // Tag names and unbraced attributes take precedence over language keywords.
    if (inJsxTag()) {
      if (inStringQuotes()) {
        return T_STRING
      }

      const [, lastToken] = last
      if (isIdentifier(token)) {
        if (lastToken === '<' || lastToken === '</') return T_ENTITY
        if (!__jsxTagExpr && /^\s+$/.test(tokens[tokens.length - 1]?.[1] || '')) return T_PROPERTY
      }
    }
    const isJsxLiterals = inJsxLiterals()
    if (isJsxLiterals) return T_JSX_LITERALS

    if (inStringQuotes() || inStrTemplateLiterals()) {
      return T_STRING
    } else if (resolvedTypeKeywords && resolvedTypeKeywords.has(normalizeKeyword(token))) {
      return last[1] === '.' ? T_IDENTIFIER : T_CLS_NUMBER
    } else if (resolvedKeywords.has(normalizeKeyword(token))) {
      return last[1] === '.' ? T_IDENTIFIER : T_KEYWORD
    } else if (isLineBreak) {
      return T_BREAK
    } else if (isSpaces(token)) {
      return T_SPACE
    } else if (isSigns(token)) {
      return T_SIGN
    } else if (isCls(token)) {
      return inJsxTag() && !__jsxTagExpr ? T_IDENTIFIER : T_CLS_NUMBER
    } else {
      if (isIdentifier(token)) {
        const isLastPropDot = last[1] === '.' && isIdentifier(beforeLast[1])

        if (!inStringContent() && !isLastPropDot) return T_IDENTIFIER
        if (isLastPropDot) return T_PROPERTY
      }
      return T_STRING
    }
  }

  /**
   * @param {number | undefined} [type_]
   * @param {string | undefined} [token_]
   */
  const append = (type_, token_) => {
    if (token_) {
      current = token_
    }
    if (current) {
      type = typeof type_ === 'number' ? type_ : classify(current)
      /** @type [number, string]  */
      const pair = [type, current]
      if (supportsRegex && type !== T_SPACE && type !== T_BREAK && type !== T_COMMENT) {
        if (type === T_SIGN && current === '(') {
          if (!controlParentheses) controlParentheses = []
          controlParentheses.push(
            previousSyntaxType === T_KEYWORD &&
              ControlConditionKeywords.has(normalizeKeyword(previousSyntaxToken))
          )
        }
        const closesControl =
          type === T_SIGN && current === ')' && controlParentheses?.pop() === true
        regexAllowed =
          (type === T_SIGN && (current !== ')' || closesControl)) ||
          (type === T_KEYWORD && RegexExpressionKeywords.has(normalizeKeyword(current)))
        previousSyntaxType = type
        previousSyntaxToken = current
      }
      if (type !== T_SPACE && type !== T_BREAK) {
        beforeLast = last
        last = pair
      }
      if (inJsxTag() && type === T_SIGN) {
        if (current === '{') __jsxTagExpr++
        if (current === '}') __jsxTagExpr--
      }
      tokens.push(pair)
    }
    current = ''
    currentLastIsWord = false
    currentIsSpaces = false
  }
  let numberEnd = 0
  for (let i = 0; i < code.length; i++) {
    const curr = code[i]
    const prev = code[i - 1]
    const next = code[i + 1]
    const closingTag = curr === '<' && next === '/'
    const selfClosingTag = curr === '/' && next === '>'
    const previousClosingTag = prev === '<' && curr === '/'

    // Clamp quote-hook lengths to remaining code units so recovery cannot advance past EOF.
    if (
      typeof mergedOptions.onQuote === 'function' &&
      curr === "'" &&
      !inStringQuotes() &&
      !inJsxLiterals() &&
      !inStrTemplateLiterals()
    ) {
      const rawLen = mergedOptions.onQuote(curr, i, code)
      if (typeof rawLen === 'number' && rawLen >= 1 && !Number.isNaN(rawLen)) {
        const len = Math.min(rawLen, code.length - i)
        const end = i + len
        append()
        append(T_IDENTIFIER, code.slice(i, end))
        i = end - 1
        continue
      }
    }

    // Quotes in JSX/template text are data, not JavaScript string boundaries.
    if (isSingleQuotes(curr) && !inJsxLiterals() && !inStrTemplateLiterals()) {
      append()
      let isStringClose = false
      if (__strQuote && curr === __strQuote) {
        __strQuote = null
        isStringClose = true
      } else if (!__strQuote) {
        __strQuote = curr
        __strTokenStart = tokens.length
      }

      append(T_STRING, curr)
      if (mergedOptions.quotedKeys && isStringClose && isPropertyKey(code, i)) {
        for (let tokenIndex = __strTokenStart; tokenIndex < tokens.length; tokenIndex++) {
          tokens[tokenIndex][0] = T_PROPERTY
        }
      }
      continue
    }

    if (isTemplateQuote(curr)) {
      append()
      __strTemplateQuoteStack += inStrTemplateLiterals() ? -1 : 1
      append(T_STRING, curr)
      continue
    }

    if (inStrTemplateLiterals()) {
      if (curr === '$' && next === '{') {
        __strTemplateExprStack++
        append(T_STRING)
        append(T_SIGN, '${')
        i++
        continue
      }
    }

    if (inStrTemplateExpr() && curr === '}') {
      append()
      __strTemplateExprStack--
      append(T_SIGN, curr)
      continue
    }

    if (__jsxChild()) {
      if (curr === '{') {
        append()
        append(T_SIGN, curr)
        __jsxExprDepth = 1
        continue
      }
    }

    if (__jsxEnter) {
      // Consume '</' atomically in active JSX so '/' stays part of the tag boundary.
      // A comment opener such as HTML's '<!--' between elements is left to the comment branch.
      if (!__jsxTag && curr === '<' && !onCommentStart(curr, next, i, code)) {
        append()
        if (next === '/') {
          __jsxTag = 2
          setCurrent('</')
          i++
        } else {
          __jsxTag = 1
          setCurrent(curr)
        }
        append(T_SIGN)
        continue
      }
      if (__jsxTag) {
        // Keep arrow and self-closing '>' out of the ordinary tag-end transition.
        if (curr === '>' && !'/='.includes(prev)) {
          append()
          if (__jsxTag === 1) {
            __jsxTag = 0
            __jsxStack++
          } else {
            __jsxTag = 0
            __jsxEnter = false
          }
          append(T_SIGN, curr)
          continue
        }

        // Self-closing tags add no element depth; '</' removes the closing element first.
        if (selfClosingTag || closingTag) {
          if (current !== '<' && current !== '/') {
            append()
          }

          if (selfClosingTag) {
            __jsxTag = 0
          } else {
            __jsxStack--
          }

          if (!__jsxStack) __jsxEnter = false

          setCurrent(closingTag ? '</' : '/>')
          i++
          append(T_SIGN)
          continue
        }

        if (curr === '<') {
          append()
          setCurrent(curr)
          append(T_SIGN)
          continue
        }

        // Keep hyphenated names together instead of emitting '-' as a separate sign.
        if (curr === '-' && current && !inStringContent() && !inJsxLiterals()) {
          let end = i + 1
          while (end < code.length && /[$\w-]/.test(code[end])) end++
          append(T_PROPERTY, current + code.slice(i, end))
          i = end - 1
          continue
        }
        // Pending whitespace would make a one-character attribute fail the identifier check.
        if (next === '=' && !inStringContent()) {
          if (!isSpaceChar(curr)) {
            if (currentIsSpaces) {
              append()
            }

            const prop = current + curr
            if (isIdentifier(prop)) {
              append(T_PROPERTY, prop)
              continue
            }
          }
        }
      }
    }

    // Distinguish a JSX tag from TS type arguments or a generic arrow before entering tag mode.
    if (supportsJsx && !__jsxTag && ((curr === '<' && isIdentifierChar(next)) || closingTag)) {
      let prevNonSpace = i - 1
      while (prevNonSpace >= 0 && isWhitespace(code[prevNonSpace])) prevNonSpace--
      const prevChar = prevNonSpace >= 0 ? code[prevNonSpace] : ''

      const [lastType, lastTok] = last
      // Without a space before `<`, the LHS is often still in `current` (not flushed), so `last` is stale.
      let typeArgFromPending = false
      let jsxFromPending = false
      if (current && !currentIsSpaces) {
        const w = current
        // Unflushed LHS before `<`: numbers/null/Upper (isCls), and booleans, behave like `foo<` (type
        // args / `<`). Any other keyword (`return`, `void`, …) is JSX-friendly — no keyword allowlist.
        if (isCls(w) || w === 'true' || w === 'false') {
          typeArgFromPending = true
        } else if (resolvedKeywords.has(w) && isIdentifier(w)) {
          jsxFromPending = true
        } else if (isIdentifier(w)) {
          typeArgFromPending = true
        }
      }

      const isTsTypeArgStart =
        curr === '<' &&
        (isAsciiWord(prevChar.charCodeAt(0)) || prevChar === ']' || prevChar === ')') &&
        (typeArgFromPending ||
          (!jsxFromPending &&
            (lastType === T_IDENTIFIER ||
              lastType === T_CLS_NUMBER ||
              (lastType === T_SIGN && (lastTok === ')' || lastTok === ']')))))
      let isTsGenericStart = !isTsTypeArgStart && curr === '<' && i <= genericTypeParameterEnd
      if (!isTsTypeArgStart && !isTsGenericStart && curr === '<' && !inStringContent()) {
        if (!typeDelimiterEnds) typeDelimiterEnds = new Map()
        const end = findTypeParameterListEnd(code, i, typeDelimiterEnds, findRegexClose)
        if (end >= 0) {
          genericTypeParameterEnd = end
          isTsGenericStart = true
        }
      }
      if (!isTsTypeArgStart && !isTsGenericStart) {
        __jsxTag = next === '/' ? 2 : 1
      }

      if (curr === '<' && (next === '/' || isAlpha(next))) {
        if (!isTsTypeArgStart && !isTsGenericStart && !inStringContent() && !inJsxLiterals()) {
          __jsxEnter = true
        }
      }
    }

    const isQuotationChar = isSingleQuotes(curr) || isTemplateQuote(curr)
    const isStringTemplateLiterals = inStrTemplateLiterals()
    const isRegexChar = supportsRegex && !__jsxEnter && isRegexStart(curr, next)
    const isJsxLiterals = inJsxLiterals()

    // string quotation
    if (isQuotationChar || isStringTemplateLiterals || isSingleQuotes(__strQuote)) {
      addCurrent(curr)
      // Consume the escaped character before the next delimiter check.
      if (curr === '\\') addCurrent(code[++i] || '')
    } else if (isRegexChar) {
      append()
      // Closing a control condition starts a statement; closing a call or a
      // grouped expression does not. Comments retain the preceding context.
      if (!regexAllowed) {
        append(undefined, curr)
        continue
      }

      const start = i
      const close = findRegexClose(start)
      if (close >= 0) {
        i = close
        // Lex flag suffixes without compiling patterns or rejecting newer JavaScript syntax.
        for (;;) {
          const flag = code.charCodeAt(i + 1)
          if (!(flag >= 97 && flag <= 122)) break
          i++
        }
      }

      if (close >= 0) {
        // Consume regex punctuation and quotes as one token, never as nested lexer states.
        append(T_STRING, code.slice(start, i + 1))
      } else {
        // Leave an unclosed candidate as an operator instead of consuming the remaining suffix.
        append(undefined, curr)
        i = start
      }
    } else if (onCommentStart(curr, next, i, code)) {
      append()
      const start = i
      const startCommentType = onCommentStart(curr, next, i, code)

      // Comment boundaries share the same numeric discriminator.
      if (startCommentType) {
        for (; i < code.length; i++) {
          const endCommentType = onCommentEnd(code[i - 1], code[i], i, code, start)
          if (endCommentType === startCommentType) break
        }
      }
      append(T_COMMENT, code.slice(start, i + 1))
    } else if (
      !isJsxLiterals &&
      !__jsxChild() &&
      !currentLastIsWord &&
      (numberEnd = numberLiteralEnd(code, i))
    ) {
      append()
      append(T_CLS_NUMBER, code.slice(i, numberEnd))
      i = numberEnd - 1
    } else if (curr === ' ' || curr === '\n') {
      if (curr === ' ' && (isJsxLiterals || currentIsSpaces || !current)) {
        let end = i + 1
        while (code[end] === ' ') end++
        addCurrent(code.slice(i, end))
        i = end - 1
        if (code[end] === '<') {
          append()
        }
      } else {
        append()
        append(undefined, curr)
      }
    } else {
      if (__jsxExprDepth && curr === '}') {
        append()
        append(undefined, curr)
        __jsxExprDepth--
      } else if (
        (isJsxLiterals && !JSXBrackets.has(curr)) ||
        inStrTemplateLiterals() ||
        ((isWord(curr) ===
          (typeof current === 'string' ? currentLastIsWord : isWord(current[current.length - 1])) ||
          __jsxChild()) &&
          !Signs.has(curr))
      ) {
        addCurrent(curr)
      } else {
        if (previousClosingTag) {
          setCurrent('</')
        }
        append()

        if (!previousClosingTag) {
          setCurrent(curr)
        }
        if (closingTag || selfClosingTag) {
          setCurrent(closingTag ? '</' : '/>')
          append()
          i++
        } else if (JSXBrackets.has(curr)) append()
      }
      if (__jsxExprDepth && curr === '{') __jsxExprDepth++
    }
  }

  append()

  return tokens
}

export { tokenize }
