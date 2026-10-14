// @ts-check

/** @import { LanguageId } from './lang.js' */

/**
 * @typedef {{
 *   id: LanguageId
 *   extension: string
 *   aliases: readonly string[]
 * }} Language
 */

// Metadata stays independent of tokenizer imports so name resolution remains lightweight.
/** @type {readonly Language[]} */
const languages = [
  { id: 'javascript', extension: 'js', aliases: ['js', 'jsx', 'node'] },
  { id: 'typescript', extension: 'ts', aliases: ['ts', 'tsx'] },
  { id: 'css', extension: 'css', aliases: ['scss'] },
  { id: 'python', extension: 'py', aliases: ['py', 'python3'] },
  { id: 'c', extension: 'c', aliases: [] },
  { id: 'go', extension: 'go', aliases: ['golang'] },
  { id: 'java', extension: 'java', aliases: [] },
  { id: 'rust', extension: 'rs', aliases: ['rs'] },
  { id: 'json', extension: 'json', aliases: ['jsonc', 'json5'] },
  { id: 'diff', extension: 'diff', aliases: ['patch'] },
  { id: 'shell', extension: 'sh', aliases: ['sh', 'bash', 'zsh'] },
  { id: 'cpp', extension: 'cpp', aliases: ['c++', 'cc', 'cxx'] },
  { id: 'csharp', extension: 'cs', aliases: ['c#', 'cs', 'dotnet'] },
  { id: 'sql', extension: 'sql', aliases: [] },
  { id: 'html', extension: 'html', aliases: ['htm', 'xml'] },
  { id: 'vue', extension: 'vue', aliases: [] },
  { id: 'svelte', extension: 'svelte', aliases: [] },
  { id: 'yaml', extension: 'yaml', aliases: ['yml'] },
  { id: 'markdown', extension: 'md', aliases: ['md', 'mdx'] },
  { id: 'plaintext', extension: 'txt', aliases: ['text', 'plain'] },
  { id: 'ruby', extension: 'rb', aliases: [] },
  { id: 'kotlin', extension: 'kt', aliases: ['kts'] },
  { id: 'swift', extension: 'swift', aliases: [] },
  { id: 'php', extension: 'php', aliases: [] },
  { id: 'toml', extension: 'toml', aliases: [] },
  { id: 'powershell', extension: 'ps1', aliases: ['pwsh'] },
  { id: 'dockerfile', extension: 'dockerfile', aliases: ['docker'] },
  { id: 'graphql', extension: 'graphql', aliases: ['gql'] },
  { id: 'hcl', extension: 'hcl', aliases: ['terraform', 'tf'] },
  { id: 'zig', extension: 'zig', aliases: [] },
  { id: 'lua', extension: 'lua', aliases: [] },
  // Toneriko Script is the Misskey (Toneriko) fork of AiScript; it shares the syntax and the id.
  { id: 'aiscript', extension: 'tks', aliases: ['is', 'ais', 'toneriko-script', 'tonerikoscript'] },
]

/** @param {string} value */
function normalizeLanguageName(value) {
  return value.trim().toLowerCase().replace(/^\./, '')
}

/** @type {Map<string, Language>} */
const languageLookup = new Map()

for (const language of languages) {
  const names = new Set([language.id, language.extension, ...language.aliases])
  for (const name of names) {
    const normalized = normalizeLanguageName(name)
    const existing = languageLookup.get(normalized)
    if (existing && existing !== language) {
      throw new Error(
        `Language name "${normalized}" is shared by "${existing.id}" and "${language.id}"`
      )
    }
    languageLookup.set(normalized, language)
  }
}

/**
 * Find canonical language metadata using a name, alias, or preferred extension.
 * @param {string} name
 * @returns {Language | undefined}
 */
function findLanguage(name) {
  if (typeof name !== 'string') return undefined
  return languageLookup.get(normalizeLanguageName(name))
}

/**
 * Resolve a name, alias, or extension to its canonical language name.
 * @param {string} name
 * @returns {LanguageId | undefined}
 */
function lang(name) {
  return findLanguage(name)?.id
}

export { lang }
