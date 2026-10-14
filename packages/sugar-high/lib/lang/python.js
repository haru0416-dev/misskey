// @ts-check
const keywords = new Set(
  'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(
    ' '
  )
)

const onCommentStart = (currentChar, _nextChar) => {
  return currentChar === '#' ? 1 : 0
}

const onCommentEnd = (_prevChar, currChar) => {
  return currChar === '\n' ? 1 : 0
}

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { keywords, onCommentStart, onCommentEnd }

export default config
