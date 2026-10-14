// @ts-check
import { config as css } from './css-runtime.js'
import { tokenize as tokenizeJavaScript } from './javascript-runtime.js'

/** @satisfies {import('../lexer.js').LexerConfig} */
const htmlOptions = {
  keywords: new Set(),
  jsx: true,
  regex: false,
  templateStrings: false,
  onCommentStart: (_currentChar, _nextChar, index, code) =>
    code.startsWith('<!--', index) ? 2 : 0,
  onCommentEnd: (_prevChar, _currChar, index, code) =>
    code.slice(index - 2, index + 1) === '-->' ? 2 : 0,
}

const tokenizeHtml = code => tokenizeJavaScript(code, htmlOptions)

const embeddedOpeningTag = /^<\s*(script|style)\b/i

/** Find the end of a markup tag without treating `>` inside quotes as its end. */
function findTagEnd(code, start) {
  let quote = ''
  for (let index = start; index < code.length; index++) {
    const character = code[index]
    if (quote) {
      if (character === quote) quote = ''
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return index + 1
    }
  }
  return -1
}

/** Skip comments and quoted attributes so their tag-like text cannot start embedded blocks. */
function findEmbeddedBlocks(code) {
  const blocks = []
  const closings = {
    script: { pattern: /<\/\s*script\s*>/gi, exhausted: false },
    style: { pattern: /<\/\s*style\s*>/gi, exhausted: false },
  }
  let index = 0
  while (index < code.length) {
    if (code.startsWith('<!--', index)) {
      const commentEnd = code.indexOf('-->', index + 4)
      index = commentEnd === -1 ? code.length : commentEnd + 3
      continue
    }
    if (code[index] !== '<') {
      index++
      continue
    }

    const openEnd = findTagEnd(code, index)
    if (openEnd === -1) break
    const opening = code.slice(index, openEnd)
    const match = opening.match(embeddedOpeningTag)
    if (!match) {
      index = openEnd
      continue
    }

    const tag = match[1].toLowerCase()
    const closing = closings[tag]
    if (closing.exhausted) {
      index = openEnd
      continue
    }
    // A failed suffix has no later closing tag; cache it to avoid rescanning.
    closing.pattern.lastIndex = openEnd
    const closeMatch = closing.pattern.exec(code)
    if (!closeMatch) {
      closing.exhausted = true
      index = openEnd
      continue
    }
    blocks.push({
      start: index,
      openEnd,
      closeStart: closeMatch.index,
      end: closing.pattern.lastIndex,
      tag,
    })
    index = closing.pattern.lastIndex
  }
  return blocks
}

/** Append without the argument-count limit of spreading a large token array. */
function appendTokens(target, source) {
  for (const token of source) target.push(token)
}

/**
 * Tokenize HTML-like files while delegating script and style bodies to their
 * existing language presets. Framework-specific template syntax remains HTML-like.
 * @param {string} code
 * @returns {Array<[number, string]>}
 */
export function tokenizeEmbeddedHtml(code) {
  /** @type {Array<[number, string]>} */
  const tokens = []
  let cursor = 0

  for (const block of findEmbeddedBlocks(code)) {
    const { start, openEnd, closeStart, end, tag } = block

    appendTokens(tokens, tokenizeHtml(code.slice(cursor, start)))
    appendTokens(tokens, tokenizeHtml(code.slice(start, openEnd)))
    appendTokens(
      tokens,
      tag === 'style'
        ? css.tokenize(code.slice(openEnd, closeStart), css)
        : tokenizeJavaScript(code.slice(openEnd, closeStart), { jsx: false })
    )
    appendTokens(tokens, tokenizeHtml(code.slice(closeStart, end)))
    cursor = end
  }

  appendTokens(tokens, tokenizeHtml(code.slice(cursor)))
  return tokens
}
