// @ts-check

const keywords = new Set(
  'and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(
    ' '
  )
)

/**
 * @param {string} curr
 * @param {string} next
 * @param {number} index
 * @param {string} code
 */
function onCommentStart(curr, next, index, code) {
  if (curr === '#' && index === 0 && next === '!') return 1
  if (curr + next !== '--') return 0
  return /^--\[=*\[/.test(code.slice(index)) ? 2 : 1
}

/**
 * @param {string} _prev
 * @param {string} curr
 * @param {number} index
 * @param {string} code
 * @param {number} start
 */
function onCommentEnd(_prev, curr, index, code, start) {
  if (curr === '\n') return 1
  if (curr !== ']') return 0
  if (!code.startsWith('--[', start)) return 0
  let before = index - 1
  let equals = 0
  // Only the opener's `=` width closes this long comment; other levels remain payload.
  while (code[before] === '=') {
    if (code[start + 3 + equals] !== '=') return 0
    equals++
    before--
  }
  return code[before] === ']' && code[start + 3 + equals] === '[' ? 2 : 0
}

/** @param {string} curr @param {number} index @param {string} code */
function onLiteral(curr, index, code) {
  if (curr !== '[') return 0
  const opener = code.slice(index).match(/^\[(=*)\[/)
  if (!opener) return 0
  const closing = `]${opener[1]}]`
  const end = code.indexOf(closing, index + opener[0].length)
  return end === -1 ? code.length - index : end + closing.length - index
}

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { keywords, onCommentStart, onCommentEnd, onLiteral }

export default config
