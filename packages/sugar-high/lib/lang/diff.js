// @ts-check

/** @import { AnnotateLine } from '../lexer.js' */

/**
 * @param {AnnotateLine} line
 * @param {{ readonly value: string, readonly lines: readonly AnnotateLine[] }} parsed
 */
const annotateLine = (line, parsed) => {
  // Core calls this for every line. One pass keeps hunk counters local to this parse.
  if (line !== parsed.lines[0]) return

  let oldRemaining = 0
  let newRemaining = 0
  for (const current of parsed.lines) {
    const value = current.value
    let annotation = ''
    const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(value)
    if (hunk) {
      oldRemaining = hunk[1] === undefined ? 1 : Number(hunk[1])
      newRemaining = hunk[2] === undefined ? 1 : Number(hunk[2])
      annotation = 'diff-hunk'
    } else if (value.startsWith('\\ No newline at end of file') || value === '') {
      continue
    } else if (value[0] === '-' && oldRemaining > 0) {
      oldRemaining--
      annotation = 'diff-remove'
    } else if (value[0] === '+' && newRemaining > 0) {
      newRemaining--
      annotation = 'diff-add'
    } else if (value[0] === ' ' && oldRemaining > 0 && newRemaining > 0) {
      oldRemaining--
      newRemaining--
    } else {
      oldRemaining = 0
      newRemaining = 0
      if (value.startsWith('+') && !value.startsWith('+++')) annotation = 'diff-add'
      else if (value.startsWith('-') && !value.startsWith('---')) annotation = 'diff-remove'
      else if (value.startsWith('@@')) annotation = 'diff-hunk'
      else if (/^(diff --git|index |--- |\+\+\+ )/.test(value)) annotation = 'diff-meta'
    }

    if (annotation === 'diff-meta') {
      for (const token of current.tokens) {
        if (token.type === 'property') token.type = 'identifier'
      }
    }
    if (annotation) current.annotations.push(annotation)
  }
}

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { annotateLine }

export default config
