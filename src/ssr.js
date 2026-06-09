/**
 * A DOM-free SSR entrypoint for pepper templates.
 */

const FORCE_SYMBOL = Symbol('force')
const TEMPLATE_RESULT_SYMBOL = Symbol('template-result')
const UNSAFE_HTML_SYMBOL = Symbol('unsafe-html')
const UNSAFE_SVG_SYMBOL = Symbol('unsafe-svg')
const UNSAFE_MATHML_SYMBOL = Symbol('unsafe-mathml')
const RAW_TEXT_SYMBOL = Symbol('raw-text')
const INTERPOLATION_MARKER = '⧙⧘'
const INTERPOLATION_PARTS_REGEXP = new RegExp(`${INTERPOLATION_MARKER}(\\d+)${INTERPOLATION_MARKER}`)
const SPREAD_SITE_REGEXP = new RegExp(`^\\.\\.\\.${INTERPOLATION_MARKER}(\\d+)${INTERPOLATION_MARKER}$`)
const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
])

const ATTRIBUTE_SITE_ERROR =
	'Nested templates and DOM elements are not allowed in attributes. Use text content interpolation instead.'
const TRUSTED_TEXT_INPUT_ERROR = 'unsafeHTML(), unsafeSVG(), unsafeMathML(), and rawText() expect a string.'
const TRUSTED_TEXT_CONTEXT_ERROR =
	'unsafeHTML(), unsafeSVG(), unsafeMathML(), and rawText() are only allowed in text content interpolation.'
const RAW_TEXT_REPLACEMENTS = [
	[/<\/script(?=[\t\n\f\r />])/gi, match => `\\x3C${match.slice(1)}`],
	[/<script(?=[\t\n\f\r />])/gi, match => `\\x3C${match.slice(1)}`],
	[/<!--/g, '\\x3C!--'],
	[/<\/style(?=[\t\n\f\r />])/gi, match => `\\x3C${match.slice(1)}`],
	[/<style(?=[\t\n\f\r />])/gi, match => `\\x3C${match.slice(1)}`],
	[/<\/textarea(?=[\t\n\f\r />])/gi, match => `\\x3C${match.slice(1)}`],
	[/<\/title(?=[\t\n\f\r />])/gi, match => `\\x3C${match.slice(1)}`],
	[/<\/template(?=[\t\n\f\r />])/gi, match => `\\x3C${match.slice(1)}`],
]
let ssrTemplateCache = new WeakMap()

/** @typedef {'html' | 'svg' | 'mathml'} TemplateMode */
/** @typedef {unknown} InterpolationValue */
/**
 * @typedef {{
 *   [TEMPLATE_RESULT_SYMBOL]: true,
 *   mode: TemplateMode,
 *   strings: TemplateStringsArray,
 *   values: readonly InterpolationValue[],
 * }} TemplateResult
 */
/**
 * @typedef {((key?: any, liveNodes?: unknown[]) => TemplateResult) & {
 *   template?: { mode: TemplateMode, strings: TemplateStringsArray }
 * }} TemplateView
 */
/**
 * @typedef {{
 *   type: 'attribute' | 'boolean-attribute' | 'property' | 'event',
 *   name: string,
 *   value: unknown,
 * }} Binding
 */
/** @typedef {{ type: 'spread', index: number }} CompiledSpreadBinding */
/** @typedef {{ type: 'attribute', name: string, parts: (string | number)[] }} CompiledAttributeBinding */
/** @typedef {{ type: 'boolean-attribute', name: string, parts: (string | number)[] | null }} CompiledBooleanAttributeBinding */
/** @typedef {CompiledSpreadBinding | CompiledAttributeBinding | CompiledBooleanAttributeBinding} CompiledBinding */
/** @typedef {{ type: 'static', value: string }} StaticOp */
/** @typedef {{ type: 'text', parts: (string | number)[] }} TextOp */
/** @typedef {{ type: 'start-tag', tagName: string, selfClosing: boolean, voidElement: boolean, bindings: CompiledBinding[] }} StartTagOp */
/** @typedef {StaticOp | TextOp | StartTagOp} CompiledOp */
/** @typedef {{ ops: CompiledOp[] }} CompiledTemplate */
/**
 * @typedef {{
 *   [UNSAFE_HTML_SYMBOL]?: string,
 *   [UNSAFE_SVG_SYMBOL]?: string,
 *   [UNSAFE_MATHML_SYMBOL]?: string,
 *   [RAW_TEXT_SYMBOL]?: string,
 * }} TrustedTextValue
 */

/**
 * @param {TemplateStringsArray} strings
 * @param {...InterpolationValue} values
 * @returns {TemplateView}
 */
export function html(strings, ...values) {
	return handleTemplateTag('html', strings, ...values)
}

/**
 * @param {TemplateStringsArray} strings
 * @param {...InterpolationValue} values
 * @returns {TemplateView}
 */
export function svg(strings, ...values) {
	return handleTemplateTag('svg', strings, ...values)
}

/**
 * @param {TemplateStringsArray} strings
 * @param {...InterpolationValue} values
 * @returns {TemplateView}
 */
export function mathml(strings, ...values) {
	return handleTemplateTag('mathml', strings, ...values)
}

/** @param {InterpolationValue} value */
export function force(value) {
	return {[FORCE_SYMBOL]: value}
}

/**
 * @param {symbol} symbol
 * @param {string} value
 */
function wrapTrustedTextValue(symbol, value) {
	if (typeof value !== 'string') throw new TypeError(TRUSTED_TEXT_INPUT_ERROR)
	return {[symbol]: value}
}

/**
 * Mark a string as trusted raw HTML and inject it without escaping.
 *
 * @param {string} value
 */
export function unsafeHTML(value) {
	return wrapTrustedTextValue(UNSAFE_HTML_SYMBOL, value)
}

/**
 * Mark a string as trusted raw SVG and inject it without escaping.
 *
 * @param {string} value
 */
export function unsafeSVG(value) {
	return wrapTrustedTextValue(UNSAFE_SVG_SYMBOL, value)
}

/**
 * Mark a string as trusted raw MathML and inject it without escaping.
 *
 * @param {string} value
 */
export function unsafeMathML(value) {
	return wrapTrustedTextValue(UNSAFE_MATHML_SYMBOL, value)
}

/**
 * Emit raw text content without entity escaping.
 *
 * @param {string} value
 */
export function rawText(value) {
	return wrapTrustedTextValue(RAW_TEXT_SYMBOL, value)
}

/**
 * @param {InterpolationValue | TemplateView | TemplateResult | readonly InterpolationValue[]} value
 * @returns {string}
 */
export function renderToString(value) {
	return serializeChildValue(value)
}

/**
 * Clear the SSR template compilation cache.
 */
export function clearTemplateCache() {
	ssrTemplateCache = new WeakMap()
}

/**
 * @param {InterpolationValue} value
 * @returns {InterpolationValue}
 */
function unwrapForce(value) {
	return typeof value === 'object' && value !== null && FORCE_SYMBOL in value ? value[FORCE_SYMBOL] : value
}

/**
 * @param {TemplateMode} mode
 * @param {TemplateStringsArray} strings
 * @param {...InterpolationValue} values
 * @returns {TemplateView}
 */
function handleTemplateTag(mode, strings, ...values) {
	/** @type {TemplateView} */
	const render = function () {
		return {[TEMPLATE_RESULT_SYMBOL]: true, mode, strings, values}
	}

	render.template = {mode, strings}
	return render
}

/**
 * @param {InterpolationValue | TemplateView | TemplateResult | readonly InterpolationValue[]} value
 * @returns {string}
 */
function serializeChildValue(value) {
	value = unwrapForce(value)

	if (value == null || value === '') return ''
	if (Array.isArray(value)) return value.map(serializeChildValue).join('')
	if (typeof value === 'function') return serializeChildValue(value())
	if (looksTrustedTextValue(value)) return serializeTrustedTextValue(value)
	if (looksTemplateValue(value))
		return serializeCompiledTemplate(getCompiledTemplate(/** @type {TemplateResult} */ (value).strings), value.values)
	if (looksLikeNode(value)) throw new Error('DOM nodes are not supported by pepper/ssr')

	return escapeHtml(String(value))
}

/**
 * @param {TemplateStringsArray} strings
 * @returns {CompiledTemplate}
 */
function getCompiledTemplate(strings) {
	let compiled = ssrTemplateCache.get(strings)
	if (compiled) return compiled

	const source = strings.reduce(
		/**
		 * @param {string} htmlString
		 * @param {string} string
		 * @param {number} index
		 */
		(htmlString, string, index) =>
			htmlString +
			string +
			(index < strings.length - 1 ? `${INTERPOLATION_MARKER}${index}${INTERPOLATION_MARKER}` : ''),
		'',
	)

	/** @type {CompiledTemplate} */
	compiled = {ops: []}
	let cursor = 0
	let depth = 0

	while (cursor < source.length) {
		if (source.startsWith('<!--', cursor)) {
			const commentEnd = source.indexOf('-->', cursor + 4)
			const end = commentEnd === -1 ? source.length : commentEnd + 3
			compiled.ops.push({type: 'static', value: source.slice(cursor, end)})
			cursor = end
			continue
		}
		if (source.startsWith('<![CDATA[', cursor)) {
			const cdataEnd = source.indexOf(']]>', cursor + 9)
			const end = cdataEnd === -1 ? source.length : cdataEnd + 3
			compiled.ops.push({type: 'static', value: source.slice(cursor, end)})
			cursor = end
			continue
		}

		if (source[cursor] === '<') {
			const tag = compileTag(source, cursor)
			compiled.ops.push(tag.op)
			cursor = tag.end
			depth += tag.depthDelta
			continue
		}

		const nextTag = source.indexOf('<', cursor)
		const end = nextTag === -1 ? source.length : nextTag
		const parts = parseInterpolationParts(source.slice(cursor, end))
		const filteredParts = depth === 0
			? parts.filter(part => typeof part === 'number' || (typeof part === 'string' && part.trim() !== ''))
			: parts
		if (filteredParts.length) compiled.ops.push({type: 'text', parts: filteredParts})
		cursor = end
	}

	ssrTemplateCache.set(strings, compiled)
	return compiled
}

/**
 * @param {string} source
 * @param {number} start
 */
function compileTag(source, start) {
	if (source.startsWith('</', start)) {
		const end = source.indexOf('>', start + 2)
		const safeEnd = end === -1 ? source.length : end + 1
		return {op: {type: 'static', value: source.slice(start, safeEnd)}, end: safeEnd, depthDelta: -1}
	}

	if (source[start + 1] === '!' || source[start + 1] === '?') {
		const end = source.indexOf('>', start + 2)
		const safeEnd = end === -1 ? source.length : end + 1
		return {op: {type: 'static', value: source.slice(start, safeEnd)}, end: safeEnd, depthDelta: 0}
	}

	let cursor = start + 1
	let quote = ''

	while (cursor < source.length) {
		const char = source[cursor]

		if (quote) {
			if (char === quote) quote = ''
		} else if (char === '"' || char === "'") quote = char
		else if (char === '>') break

		cursor++
	}

	const end = Math.min(cursor + 1, source.length)
	const raw = source.slice(start, end)
	const op = compileStartTag(raw)

	return {op, end, depthDelta: op.selfClosing || op.voidElement ? 0 : 1}
}

/**
 * @param {string} raw
 * @returns {StartTagOp}
 */
function compileStartTag(raw) {
	let cursor = 1
	let tagName = ''

	while (cursor < raw.length && !/[\s/>]/.test(raw[cursor])) tagName += raw[cursor++]
	const lowerTagName = tagName.toLowerCase()

	let isSelfClosing = false
	/** @type {CompiledBinding[]} */
	const bindings = []

	while (cursor < raw.length - 1) {
		while (cursor < raw.length - 1 && /\s/.test(raw[cursor])) cursor++
		if (cursor >= raw.length - 1) break

		if (raw[cursor] === '/') {
			isSelfClosing = true
			cursor++
			continue
		}

		const nameStart = cursor
		while (cursor < raw.length - 1 && !/[\s=/>]/.test(raw[cursor])) cursor++
		const name = raw.slice(nameStart, cursor)

		while (cursor < raw.length - 1 && /\s/.test(raw[cursor])) cursor++

		let value = null

		if (raw[cursor] === '=') {
			cursor++
			while (cursor < raw.length - 1 && /\s/.test(raw[cursor])) cursor++

			if (raw[cursor] === '"' || raw[cursor] === "'") {
				const quote = raw[cursor++]
				const valueStart = cursor
				while (cursor < raw.length - 1 && raw[cursor] !== quote) cursor++
				value = raw.slice(valueStart, cursor)
				cursor++
			} else {
				const valueStart = cursor
				while (cursor < raw.length - 1 && !/[\s/>]/.test(raw[cursor])) cursor++
				value = raw.slice(valueStart, cursor)
			}
		}

		const spreadMatch = name.match(SPREAD_SITE_REGEXP)
		if (spreadMatch) {
			bindings.push({type: 'spread', index: Number(spreadMatch[1])})
			continue
		}

		if (name.startsWith('?') || name.startsWith('!?')) {
			bindings.push({
				type: 'boolean-attribute',
				name: name.slice(name[1] === '?' ? 2 : 1),
				parts: value == null ? null : parseInterpolationParts(value),
			})
			continue
		}

		if (name.startsWith('.') || name.startsWith('!.') || name.startsWith('@') || name.startsWith('!@')) continue

		bindings.push({
			type: 'attribute',
			name: name.startsWith('!') ? name.slice(1) : name,
			parts: value == null ? [''] : parseInterpolationParts(value),
		})
	}

	return {type: 'start-tag', tagName, selfClosing: isSelfClosing, voidElement: VOID_ELEMENTS.has(lowerTagName), bindings}
}

/**
 * @param {CompiledTemplate} compiled
 * @param {readonly InterpolationValue[]} values
 * @returns {string}
 */
function serializeCompiledTemplate(compiled, values) {
	let output = ''

	for (const op of compiled.ops) {
		if (op.type === 'static') output += op.value
		else if (op.type === 'text') {
			for (const part of op.parts) output += typeof part === 'number' ? serializeChildValue(values[part]) : part
		} else {
			/** @type {Map<string, Binding>} */
			const bindings = new Map()
			for (const binding of op.bindings) {
				if (binding.type === 'spread') {
					applySpreadBindings(bindings, values[binding.index])
					continue
				}

				if (binding.type === 'boolean-attribute') {
					let value = false
					if (binding.parts) {
						if (
							binding.parts.length === 3 &&
							binding.parts[0] === '' &&
							binding.parts[2] === '' &&
							typeof binding.parts[1] === 'number'
						)
							value = !!unwrapForce(values[binding.parts[1]])
						else if (binding.parts.length === 1 && typeof binding.parts[0] === 'string')
							value = binding.parts[0].trim() !== ''
						else value = true
					}
					bindings.set(`?${binding.name}`, {type: binding.type, name: binding.name, value})
					continue
				}

				let value = ''
				for (const part of binding.parts) {
					if (typeof part === 'number') value += escapeHtml(resolveAttributeInput(values[part]), true)
					else value += part.replaceAll('"', '&quot;')
				}
				bindings.set(binding.name, {type: binding.type, name: binding.name, value})
			}

			output += `<${op.tagName}`
			for (const binding of bindings.values()) {
				if (binding.type === 'attribute') output += ` ${binding.name}="${binding.value}"`
				else if (binding.type === 'boolean-attribute' && binding.value) output += ` ${binding.name}=""`
			}
			output += op.selfClosing ? '/>' : '>'
		}
	}

	return output
}

/**
 * @param {Map<string, Binding>} bindings
 * @param {InterpolationValue} spreadValue
 */
function applySpreadBindings(bindings, spreadValue) {
	spreadValue = unwrapForce(spreadValue)

	if (
		spreadValue == null ||
		spreadValue === false ||
		typeof spreadValue !== 'object' ||
		Array.isArray(spreadValue) ||
		looksLikeNode(spreadValue)
	)
		return

	for (const [name, value] of Object.entries(spreadValue)) {
		if (name.startsWith('?')) {
			bindings.set(name, {type: 'boolean-attribute', name: name.slice(1), value: !!unwrapForce(value)})
			continue
		}

		if (name.startsWith('.') || name.startsWith('@')) continue

		bindings.set(name, {
			type: 'attribute',
			name,
			value: escapeHtml(resolveAttributeInput(value), true),
		})
	}
}

/**
 * @param {InterpolationValue} value
 * @returns {string}
 */
function resolveAttributeInput(value) {
	value = unwrapForce(value)

	if (value == null) return ''
	if (looksTrustedTextValue(value)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR)
	if (typeof value === 'function' || Array.isArray(value) || looksTemplateValue(value) || looksLikeNode(value))
		throw new Error(ATTRIBUTE_SITE_ERROR)

	return String(value)
}

/**
 * @param {string} value
 * @returns {(string | number)[]}
 */
function parseInterpolationParts(value) {
	if (!value.includes(INTERPOLATION_MARKER)) return [value]
	return value.split(INTERPOLATION_PARTS_REGEXP).map((part, index) => (index % 2 === 1 ? Number(part) : part))
}

/**
 * @param {string} value
 * @param {boolean} [attribute]
 * @returns {string}
 */
function escapeHtml(value, attribute = false) {
	value = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
	return attribute ? value.replaceAll('"', '&quot;') : value
}

/** @param {InterpolationValue} value */
function looksTemplateValue(value) {
	return typeof value === 'object' && value !== null && TEMPLATE_RESULT_SYMBOL in value
}

/** @param {InterpolationValue} value */
function looksLikeNode(value) {
	return typeof value === 'object' && value !== null && 'nodeType' in value
}

/**
 * @param {InterpolationValue} value
 * @returns {value is TrustedTextValue}
 */
function looksTrustedTextValue(value) {
	return (
		typeof value === 'object' &&
		value !== null &&
		(UNSAFE_HTML_SYMBOL in value ||
			UNSAFE_SVG_SYMBOL in value ||
			UNSAFE_MATHML_SYMBOL in value ||
			RAW_TEXT_SYMBOL in value)
	)
}

/**
 * @param {TrustedTextValue} value
 * @returns {string}
 */
function serializeTrustedTextValue(value) {
	if (UNSAFE_HTML_SYMBOL in value || UNSAFE_SVG_SYMBOL in value || UNSAFE_MATHML_SYMBOL in value)
		return value[UNSAFE_HTML_SYMBOL] || value[UNSAFE_SVG_SYMBOL] || value[UNSAFE_MATHML_SYMBOL] || ''
	if (!(RAW_TEXT_SYMBOL in value)) return ''
	let text = value[RAW_TEXT_SYMBOL] || ''
	for (const [pattern, replacement] of RAW_TEXT_REPLACEMENTS) text = text.replace(pattern, replacement)
	return text
}
