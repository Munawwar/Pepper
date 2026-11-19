export const FORCE_SYMBOL = Symbol('force')
export const UNSAFE_HTML_SYMBOL = Symbol('unsafe-html')
export const UNSAFE_SVG_SYMBOL = Symbol('unsafe-svg')
export const UNSAFE_MATHML_SYMBOL = Symbol('unsafe-mathml')
export const RAW_TEXT_SYMBOL = Symbol('raw-text')

// Keep a separator so omitting a hole cannot join two pieces into "-->".
export const commentHolePattern = /⧙⧘\d+⧙⧘/g
