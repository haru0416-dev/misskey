// @ts-check
import { onCommentEnd, onCommentStart } from '../presets/hash-comment-base.js'
import { tokenize as tokenizeCore } from '../lexer.js'
/** @import { LexerConfig } from '../lexer.js' */

/** @param {string | undefined} char */
const separation = char =>
  char === ' ' || char === '\t' || char === '\r' || char === '\n' || char === undefined

/**
 * Read only a block header's modifiers and trailing comment, not scalar text.
 * @param {string} code @param {number} start @param {number} end
 */
function headerIndent(code, start, end) {
  let index = start + 1
  let indent = 0
  let chomping = false
  while (index < end && !separation(code[index])) {
    const char = code[index++]
    if (char >= '1' && char <= '9' && !indent) indent = Number(char)
    else if ((char === '+' || char === '-') && !chomping) chomping = true
    else return -1
  }
  while (index < end && separation(code[index])) index++
  return index === end || code[index] === '#' ? indent : -1
}

// Plain scalars that YAML 1.2 core schema resolves to numbers keep the number color.
const plainNumber =
  /^(?:[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|0x[\da-fA-F_]+|0o[0-7_]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/

/** @param {string} code @param {number} start @param {number} end */
function trimmedEnd(code, start, end) {
  while (end > start && (code[end - 1] === ' ' || code[end - 1] === '\t' || code[end - 1] === '\r'))
    end--
  return end
}

/**
 * End of plain scalar text on a continuation line: ` #` starts a comment.
 * @param {string} code @param {number} start @param {number} end
 */
function continuationEnd(code, start, end) {
  for (let index = start; index < end; index++) {
    if (code[index] === '#' && index > start && separation(code[index - 1]))
      return trimmedEnd(code, start, index)
  }
  return trimmedEnd(code, start, end)
}

/**
 * Find body, key, and plain-scalar boundaries before the generic lexer can interpret payload
 * quotes or comments. All lexical and indentation state belongs to this parse.
 * @param {string} code
 * @param {LexerConfig} options
 * @returns {Array<[number, string]>}
 */
function tokenize(code, options) {
  /**
   * Body start -> code-unit length. Keep source whitespace; do not fold or chomp YAML values.
   * Plain string scalars share this table: both are emitted as one string token.
   * @type {Map<number, number>}
   */
  const bodies = new Map()
  /**
   * Unquoted block mapping key start -> code-unit length.
   * @type {Map<number, number>}
   */
  const keys = new Map()
  /** @param {number} start @param {number} end */
  const addPlain = (start, end) => {
    const text = code.slice(start, end)
    if (
      end > start &&
      text[0] !== '*' &&
      text !== '~' &&
      !keywords.has(text) &&
      !plainNumber.test(text)
    ) {
      bodies.set(start, end - start)
    }
  }
  let quote = ''
  let flowDepth = 0
  let plainIndent = -1

  for (let start = 0; start < code.length;) {
    const newline = code.indexOf('\n', start)
    const end = newline < 0 ? code.length : newline
    let index = start
    while (code[index] === ' ' && index < end) index++
    const indent = index - start
    if (index < end && code[index] !== '\r' && code[index] !== '#' && plainIndent >= indent) {
      plainIndent = -1
    }
    if (plainIndent >= 0) {
      if (index < end && code[index] !== '#') {
        const textEnd = continuationEnd(code, index, end)
        if (textEnd > index) bodies.set(index, textEnd - index)
      }
      start = newline < 0 ? code.length : newline + 1
      continue
    }
    let scalarPosition = !quote && !flowDepth
    let mapping = false
    let baseIndent = indent
    let nodeIndent = indent
    let plain = false
    let plainStart = -1
    let contentEnd = end
    let bodyEnd = -1

    // A document-start marker may precede a root scalar on the same line.
    if (index === start && code.startsWith('---', index) && separation(code[index + 3])) {
      index += 3
    }

    for (; index < end; index++) {
      const char = code[index]
      if (quote) {
        if (quote === '"' && char === '\\') index++
        else if (char === quote) {
          if (quote === "'" && code[index + 1] === "'") index++
          else quote = ''
        }
        continue
      }
      if (separation(char)) continue
      if (char === '#' && (index === start || separation(code[index - 1]))) {
        contentEnd = index
        break
      }
      if (char === '"' || char === "'") {
        // Quotes inside plain scalars have no YAML quoting significance.
        if (!plain) quote = char
        scalarPosition = false
        continue
      }
      if ((char === '[' || char === '{') && !plain) {
        flowDepth++
        scalarPosition = false
        continue
      }
      if (char === ']' || char === '}') {
        flowDepth = Math.max(0, flowDepth - 1)
        continue
      }
      if (flowDepth) continue
      if ((char === '-' || char === '?') && scalarPosition && separation(code[index + 1])) {
        baseIndent = index - start
        index++
        while (index < end && separation(code[index])) index++
        nodeIndent = index - start
        index--
        continue
      }
      if (char === ':' && !mapping && separation(code[index + 1])) {
        if (plain && plainStart >= 0) {
          const keyEnd = trimmedEnd(code, plainStart, index)
          if (keyEnd > plainStart) keys.set(plainStart, keyEnd - plainStart)
        }
        plainStart = -1
        mapping = true
        scalarPosition = true
        plain = false
        baseIndent = nodeIndent
        continue
      }
      if ((char === '&' || char === '!') && scalarPosition) {
        while (index + 1 < end && !separation(code[index + 1])) index++
        continue
      }
      if ((char === '|' || char === '>') && scalarPosition) {
        const explicitIndent = headerIndent(code, index, end)
        if (explicitIndent >= 0 && newline >= 0) {
          const rootScalar = indent === 0 && !mapping && nodeIndent === 0
          let contentIndent = explicitIndent ? baseIndent + explicitIndent : -1
          bodyEnd = end + 1
          while (bodyEnd < code.length) {
            const nextNewline = code.indexOf('\n', bodyEnd)
            const lineEnd = nextNewline < 0 ? code.length : nextNewline
            let content = bodyEnd
            while (content < lineEnd && code[content] === ' ') content++
            const blank = content === lineEnd || (code[content] === '\r' && content + 1 === lineEnd)
            if (!blank) {
              const width = content - bodyEnd
              if (
                width === 0 &&
                (code.startsWith('---', content) || code.startsWith('...', content)) &&
                (content + 3 === lineEnd || separation(code[content + 3]))
              )
                break
              if (contentIndent < 0) {
                if (width <= baseIndent && !(rootScalar && width === 0)) break
                contentIndent = width
              }
              if (width < contentIndent) break
            }
            bodyEnd = nextNewline < 0 ? code.length : nextNewline + 1
          }
          if (bodyEnd > end + 1) bodies.set(end + 1, bodyEnd - end - 1)
          plain = false
          break
        }
      }
      if (scalarPosition) {
        plain = true
        plainStart = index
      }
      scalarPosition = false
    }

    if (plain && !quote && !flowDepth && bodyEnd < 0 && plainStart >= 0) {
      addPlain(plainStart, trimmedEnd(code, plainStart, contentEnd))
    }

    if (plain && !quote && !flowDepth) plainIndent = baseIndent
    // Resume at the dedent/document boundary so payload quotes cannot affect later YAML.
    if (bodyEnd >= 0) {
      plainIndent = -1
      start = bodyEnd
    } else start = newline < 0 ? code.length : newline + 1
  }
  if (!bodies.size && !keys.size) return tokenizeCore(code, { ...options, tokenize: undefined })

  const inheritedLiteral = options.onLiteral
  const inheritedCommentStart = options.onCommentStart || onCommentStart

  return tokenizeCore(code, {
    ...options,
    tokenize: undefined,
    onLiteral: (curr, index, source) =>
      bodies.get(index) || inheritedLiteral?.(curr, index, source),
    onKey: (_curr, index) => keys.get(index),
    onCommentStart: (curr, next, index, source) =>
      curr === '#' && bodies.has(index) ? 0 : inheritedCommentStart(curr, next, index, source),
  })
}

const keywords = new Set(
  'false False FALSE no No NO null Null NULL off Off OFF on On ON true True TRUE yes Yes YES'.split(
    ' '
  )
)

const quotedKeys = true

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { tokenize, keywords, quotedKeys, onCommentEnd, onCommentStart }

export default config
