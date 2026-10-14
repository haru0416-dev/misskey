// @ts-check

import { assemble } from './shared.js'
import { tokenize } from './lexer.js'

/** @import { LanguageConfig } from './core.js' */
/** @import { LexerConfig } from './lexer.js' */

/** @param {string} code @param {LanguageConfig} config */
function parse(code, config) {
  const options = /** @type {LexerConfig} */ (/** @type {unknown} */ (config))
  const annotateLine = options.annotateLine
  const parsed = assemble(code, tokenize(code, options))
  if (annotateLine) {
    for (const line of parsed.lines) annotateLine.call(options, line, parsed)
  }
  return parsed
}

export { parse }
