// @ts-check
import { onCommentEnd, onCommentStart } from '../presets/hash-comment-base.js'
const caseInsensitive = true
const keywords = new Set(
  'add arg cmd copy entrypoint env expose from healthcheck label maintainer onbuild run shell stopsignal user volume workdir'.split(
    ' '
  )
)

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { caseInsensitive, keywords, onCommentEnd, onCommentStart }

export default config
