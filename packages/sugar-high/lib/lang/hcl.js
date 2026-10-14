// @ts-check
const keywords = new Set('false for if in null true'.split(' '))
const onCommentStart = (curr, next) =>
  curr === '#' ? 1 : curr + next === '//' ? 1 : curr + next === '/*' ? 2 : 0
const onCommentEnd = (prev, curr) => (curr === '\n' ? 1 : prev + curr === '*/' ? 2 : 0)

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { keywords, onCommentStart, onCommentEnd }

export default config
