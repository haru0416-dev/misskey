// @ts-check
import { T_IDENTIFIER, T_SIGN } from '../shared.js'
/** @param {string} code */
const tokenize = code => {
  /** @type {Array<[number, string]>} */
  const tokens = []
  let fence = ''
  let fenceQuoted = false

  /** @param {number} type @param {string} value */
  const append = (type, value) => {
    if (!value) return
    const previous = tokens[tokens.length - 1]
    if (previous?.[0] === type) previous[1] += value
    else tokens.push([type, value])
  }

  for (const part of code.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!part) continue
    const newline = part.endsWith('\n') ? '\n' : ''
    const line = newline ? part.slice(0, -1) : part
    /** @type {Array<[number, number]>} */
    const ranges = []
    const container = line.match(/^(?: {0,3}>[ \t]?)*/)?.[0] || ''
    if (!fence || fenceQuoted) {
      for (const match of container.matchAll(/>/g)) {
        ranges.push([match.index, match.index + 1])
      }
    }

    let start = container.length
    let spaces = 0
    while (spaces < 3 && line[start] === ' ') {
      start++
      spaces++
    }
    const fenceMarker = line.slice(start).match(/^(`{3,}|~{3,})/)?.[1]

    if (fence) {
      if (
        fenceMarker?.[0] === fence[0] &&
        fenceMarker.length >= fence.length &&
        /^\s*$/.test(line.slice(start + fenceMarker.length))
      ) {
        ranges.push([start, start + fenceMarker.length])
        fence = ''
        fenceQuoted = false
      }
    } else if (fenceMarker) {
      ranges.push([start, start + fenceMarker.length])
      fence = fenceMarker
      fenceQuoted = container.includes('>')
    } else {
      const prefix = line
        .slice(start)
        .match(
          /^(#{1,6}(?=\s)|(?:[-+*]|\d+[.)])(?=\s)|(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$)/
        )?.[1]
      if (prefix) ranges.push([start, start + prefix.length])

      for (const match of line.matchAll(/(`+)(.*?)\1|(\*{1,3}|_{1,3}|~{2})(?=\S)(.*?\S)\3/g)) {
        const marker = match[1] || match[3]
        if (
          line[match.index - 1] === '\\' ||
          (marker[0] === '_' && /\w/.test(line[match.index - 1] || ''))
        )
          continue
        ranges.push(
          [match.index, match.index + marker.length],
          [match.index + match[0].length - marker.length, match.index + match[0].length]
        )
      }
    }

    let offset = 0
    for (const [rangeStart, rangeEnd] of ranges.sort((a, b) => a[0] - b[0])) {
      if (rangeStart < offset) continue
      append(T_IDENTIFIER, line.slice(offset, rangeStart))
      append(T_SIGN, line.slice(rangeStart, rangeEnd))
      offset = rangeEnd
    }
    append(T_IDENTIFIER, line.slice(offset) + newline)
  }

  return tokens
}

/** @param {import('../lexer.js').AnnotateLine} line */
const annotateLine = line => {
  const prefix = line.value.match(
    /^((?: {0,3}>[ \t]?)*)( {0,3})(`{3,}|~{3,}|#{1,6}(?=\s)|(?:[-+*]|\d+[.)])(?=\s))?/
  )
  const container = prefix?.[1] || ''
  const marker = prefix?.[3] || ''
  const markerStart = container.length + (prefix?.[2].length || 0)
  const markerEnd = markerStart + marker.length
  const quoteStart = container.indexOf('>')
  let offset = 0
  let annotation = ''
  for (const token of line.tokens) {
    const end = offset + token.value.length
    if (token.type === 'sign') {
      if (quoteStart >= offset && quoteStart < end) annotation = 'markdown-quote'
      // Syntax ranges, not a second fence state, decide whether this prefix is active.
      if (marker && markerStart >= offset && markerEnd <= end) {
        if (marker[0] === '`' || marker[0] === '~') annotation = 'markdown-fence'
        else if (!container) {
          annotation = marker[0] === '#' ? 'markdown-heading' : 'markdown-list'
        }
        break
      }
    }
    offset = end
  }
  if (annotation) line.annotations.push(annotation)
}

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { tokenize, annotateLine }

export default config
