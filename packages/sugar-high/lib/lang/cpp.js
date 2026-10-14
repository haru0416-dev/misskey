// @ts-check
import { onCommentEnd, onCommentStart } from '../presets/clike-base.js'

const keywords = new Set(
  'alignas alignof and and_eq asm auto bitand bitor break case catch class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do dynamic_cast else enum explicit export extern false for friend goto if inline mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union using virtual volatile while xor xor_eq'.split(
    ' '
  )
)

const typeKeywords = new Set(
  'bool char char8_t char16_t char32_t double float int long short signed unsigned void wchar_t'.split(
    ' '
  )
)

/** @satisfies {import('../lexer.js').LexerConfig} */
const config = { keywords, typeKeywords, onCommentEnd, onCommentStart }

export default config
