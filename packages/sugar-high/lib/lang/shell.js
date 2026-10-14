// @ts-check
import { tokenize as tokenizePlain } from '../lexer.js'

/** @import { LexerConfig } from '../lexer.js' */

const keywords = new Set(
  'case coproc do done elif else esac export fi for function if in local readonly return select then time until while'.split(
    ' '
  )
)

const emptyTypeKeywords = new Set()

/** @param {string} char */
const isBoundary = char => char === undefined || ' \t\r\n;|&()<>'.includes(char)

/**
 * Keep nested command substitutions inside the enclosing literal. Single
 * quotes do not recognize escapes; the other frames do.
 * @param {string} code
 * @param {number} start
 */
function literalEnd(code, start) {
  const opening = code[start]
  if (opening === "'") {
    const end = code.indexOf("'", start + 1)
    return end < 0 ? code.length : end + 1
  }
  let index = start + (opening === '$' ? 2 : 1)
  if (opening !== '$') {
    for (; index < code.length; index++) {
      const char = code[index]
      if (char === '\\') index++
      else if (char === opening) return index + 1
      else if (opening === '"' && (char === '`' || (char === '$' && code[index + 1] === '('))) break
    }
    if (index >= code.length) return code.length
  }
  /** @type {Array<{ quote: string, depth: number, wordStart: boolean }>} */
  const frames = [
    {
      quote: opening === '$' ? '' : opening,
      depth: 1,
      wordStart: true,
    },
  ]
  while (index < code.length && frames.length) {
    const frame = frames[frames.length - 1]
    const char = code[index]
    if (frame.quote === "'") {
      if (char === "'") frames.pop()
      index++
      continue
    }
    if (char === '\\') {
      if (code[index + 1] !== '\n') frame.wordStart = false
      index = Math.min(index + 2, code.length)
      continue
    }
    if (frame.quote && char === frame.quote) {
      frames.pop()
      index++
      continue
    }
    if (char === '$' && code[index + 1] === '(' && frame.quote !== '`') {
      frames.push({ quote: '', depth: 1, wordStart: true })
      index += 2
      frame.wordStart = false
      continue
    }
    if (!frame.quote) {
      if (char === '#' && frame.wordStart) {
        const newline = code.indexOf('\n', index)
        index = newline < 0 ? code.length : newline
        continue
      }
      if (char === "'" || char === '"' || char === '`') {
        frames.push({ quote: char, depth: 0, wordStart: true })
        frame.wordStart = false
      } else if (char === '(') {
        frame.depth++
        frame.wordStart = true
      } else if (char === ')') {
        if (--frame.depth === 0) frames.pop()
        frame.wordStart = true
      } else {
        frame.wordStart = isBoundary(char)
      }
    } else if (frame.quote === '"' && char === '`') {
      frames.push({ quote: '`', depth: 0, wordStart: true })
    }
    index++
  }
  return index
}

/**
 * Read a shell word with quote removal, without expanding its contents.
 * @param {string} code
 * @param {number} index
 * @returns {{ delimiter: string, stripTabs: boolean } | undefined}
 */
function heredocDelimiter(code, index) {
  const stripTabs = code[index] === '-'
  if (stripTabs) index++
  while (code[index] === ' ' || code[index] === '\t') index++
  if (isBoundary(code[index]) || code[index] === '#') return

  const parts = []
  let present = false
  while (index < code.length && !isBoundary(code[index])) {
    const char = code[index]
    present = true
    if (char === "'" || char === '"') {
      const quote = char
      let start = ++index
      while (index < code.length && code[index] !== quote) {
        if (quote === '"' && code[index] === '\\' && '$`"\\\n'.includes(code[index + 1] || '\0')) {
          parts.push(code.slice(start, index))
          if (code[index + 1] !== '\n') parts.push(code[index + 1])
          index += 2
          start = index
        } else {
          index++
        }
      }
      if (index === code.length) return
      parts.push(code.slice(start, index++))
    } else if (char === '\\') {
      if (index + 1 === code.length) return
      if (code[index + 1] !== '\n') parts.push(code[index + 1])
      index += 2
    } else {
      const start = index++
      while (
        index < code.length &&
        !isBoundary(code[index]) &&
        code[index] !== "'" &&
        code[index] !== '"' &&
        code[index] !== '\\'
      )
        index++
      parts.push(code.slice(start, index))
    }
  }
  return present ? { delimiter: parts.join(''), stripTabs } : undefined
}

/**
 * Find literal and heredoc boundaries once, then run the shared lexer once.
 * State and offsets belong to this invocation, never to the preset config.
 * @param {string} code
 * @param {LexerConfig} options
 * @returns {Array<[number, string]>}
 */
function tokenize(code, options) {
  const inheritedLiteral = options.onLiteral
  // Ordinary quotes need no boundary table; substitutions, heredocs, and continuations do.
  if (!code.includes('<<') && !code.includes('$(') && !code.includes('\\\n')) {
    return tokenizePlain(code, {
      ...options,
      typeKeywords: options.typeKeywords || emptyTypeKeywords,
      tokenize: undefined,
      onLiteral(curr, index, source) {
        if (curr === "'" || curr === '"' || curr === '`') return literalEnd(source, index) - index
        if (curr === '\\') return Math.min(2, source.length - index)
        return inheritedLiteral?.(curr, index, source)
      },
      onCommentStart: (curr, _next, index, source) =>
        curr === '#' && (index === 0 || isBoundary(source[index - 1])) ? 1 : 0,
      onCommentEnd: (_prev, curr) => (curr === '\n' ? 1 : 0),
    })
  }
  // Sorted, non-overlapping [start, end) offsets in the original UTF-16 source.
  /** @type {Array<[number, number]>} */
  const literals = []
  /** @type {Array<[number, number]>} */
  const comments = []
  /** @type {Array<{ delimiter: string, stripTabs: boolean }>} */
  const pending = []
  let wordStart = true
  let wordBegin = 0

  /**
   * A substitution attached to a word can absorb earlier quoted spans in that word.
   * @param {number} start
   * @param {number} end
   */
  function addLiteralRange(start, end) {
    while (literals.length && literals[literals.length - 1][0] >= start) literals.pop()
    literals.push([start, end])
  }

  for (let index = 0; index < code.length;) {
    const char = code[index]
    if (wordStart && !isBoundary(char)) wordBegin = index
    if (
      char === '\\' ||
      char === "'" ||
      char === '"' ||
      char === '`' ||
      (char === '$' && code[index + 1] === '(')
    ) {
      const end = char === '\\' ? Math.min(index + 2, code.length) : literalEnd(code, index)
      // `$` is a word character in core. Include an attached word prefix so
      // its word scan cannot step over the substitution's literal boundary.
      const start = char === '$' ? wordBegin : index
      addLiteralRange(start, end)
      if (!(char === '\\' && code[index + 1] === '\n')) wordStart = false
      index = end
      continue
    }
    if (char === '#' && wordStart) {
      const newline = code.indexOf('\n', index)
      const end = newline < 0 ? code.length : newline
      comments.push([index, end])
      index = end
      continue
    }
    if (char === '<' && code[index + 1] === '<') {
      if (code[index + 2] === '<') {
        index += 3
      } else {
        const heredoc = heredocDelimiter(code, index + 2)
        if (heredoc) pending.push(heredoc)
        index += 2
      }
      wordStart = true
      continue
    }
    if (char === '\n' && pending.length) {
      index++
      for (const { delimiter, stripTabs } of pending) {
        const bodyStart = index
        let bodyEnd = code.length
        while (index < code.length) {
          const newline = code.indexOf('\n', index)
          const lineEnd = newline < 0 ? code.length : newline
          let candidate = index
          if (stripTabs) while (code[candidate] === '\t') candidate++
          if (lineEnd - candidate === delimiter.length && code.startsWith(delimiter, candidate)) {
            bodyEnd = lineEnd
            index = lineEnd
            break
          }
          index = newline < 0 ? code.length : newline + 1
        }
        // Color the delimiter with its body, but leave its newline to line assembly.
        if (bodyEnd > bodyStart) addLiteralRange(bodyStart, bodyEnd)
        if (code[index] === '\n') index++
      }
      pending.length = 0
      wordStart = true
      continue
    }
    wordStart = isBoundary(char)
    index++
  }

  let literalIndex = 0
  let commentIndex = 0
  let commentEnd = 0

  return tokenizePlain(code, {
    ...options,
    typeKeywords: options.typeKeywords || emptyTypeKeywords,
    tokenize: undefined,
    onLiteral(curr, index, source) {
      while (literals[literalIndex]?.[0] < index) literalIndex++
      if (literals[literalIndex]?.[0] === index) return literals[literalIndex++][1] - index
      return inheritedLiteral?.(curr, index, source)
    },
    onCommentStart(curr, _next, index) {
      if (curr !== '#' || comments[commentIndex]?.[0] !== index) return 0
      commentEnd = comments[commentIndex++][1]
      return 1
    },
    onCommentEnd: (_prev, _curr, index) => (index >= commentEnd - 1 ? 1 : 0),
  })
}

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { keywords, tokenize }

export default config
