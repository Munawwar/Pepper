const INTERPOLATION_MARKER = '⧙⧘'
const componentTemplateCache = new WeakMap()
const sourceTemplateCache = new Map()

/**
 * @typedef {string[] & { raw: string[] }} MutableTemplateStringsArray
 * @typedef {{ type: 'spread', index: number } | { type: 'prop', name: string, parts: Array<number | string> | null }} ComponentBinding
 * @typedef {{ type: 'value', index: number } | ComponentDescriptor} ComponentTemplateEntry
 * @typedef {{
 *   type: 'component',
 *   componentIndex: number,
 *   bindings: ComponentBinding[],
 *   childrenSource: string | null,
 * }} ComponentDescriptor
 * @typedef {{ strings: TemplateStringsArray, values: ComponentTemplateEntry[] }} CompiledComponentTemplate
 * @typedef {{ strings: TemplateStringsArray, values: unknown[] }} LoweredComponentTemplate
 * @typedef {{ indices: number[], strings: TemplateStringsArray }} SourceTemplate
 */

/**
 * @param {string} source
 * @param {number} start
 * @returns {{ index: number, end: number } | null}
 */
function readInterpolationMarker(source, start) {
	if (!source.startsWith(INTERPOLATION_MARKER, start)) return null
	const valueStart = start + INTERPOLATION_MARKER.length
	const valueEnd = source.indexOf(INTERPOLATION_MARKER, valueStart)
	if (valueEnd === -1) return null
	return {
		index: parseInt(source.slice(valueStart, valueEnd)),
		end: valueEnd + INTERPOLATION_MARKER.length,
	}
}

/**
 * @param {string} source
 * @returns {Array<number | string>}
 */
function parseInterpolationParts(source) {
	const parts = []
	let cursor = 0
	while (cursor < source.length) {
		const marker = readInterpolationMarker(source, cursor)
		if (marker) {
			parts.push(marker.index)
			cursor = marker.end
			continue
		}
		const nextMarker = source.indexOf(INTERPOLATION_MARKER, cursor)
		if (nextMarker === -1) {
			parts.push(source.slice(cursor))
			break
		}
		parts.push(source.slice(cursor, nextMarker))
		cursor = nextMarker
	}
	return parts
}

/**
 * @param {Array<number | string> | null} parts
 * @param {unknown[]} values
 * @returns {unknown}
 */
function resolveParts(parts, values) {
	if (!parts) return true
	if (parts.length === 1 && typeof parts[0] === 'number') return values[parts[0]]
	return parts.map(part => (typeof part === 'number' ? String(values[part] ?? '') : part)).join('')
}

/**
 * @param {string} source
 * @param {number} start
 * @returns {{ componentIndex: number, attributesSource: string, selfClosing: boolean, end: number } | null}
 */
function readDynamicComponentOpen(source, start) {
	if (source[start] !== '<') return null
	const marker = readInterpolationMarker(source, start + 1)
	if (!marker) return null
	let cursor = marker.end
	let quote = ''
	while (cursor < source.length) {
		const character = source[cursor]
		if (quote) {
			if (character === quote) quote = ''
		} else if (character === '"' || character === "'") quote = character
		else if (character === '>') break
		cursor++
	}
	if (cursor >= source.length) return null
	const rawAttributes = source.slice(marker.end, cursor)
	return {
		componentIndex: marker.index,
		attributesSource: rawAttributes.replace(/\/\s*$/, ''),
		selfClosing: /\/\s*$/.test(rawAttributes),
		end: cursor + 1,
	}
}

/**
 * @param {string} source
 * @param {number} start
 * @returns {{ componentIndex: number, start: number, end: number } | null}
 */
function readDynamicComponentClose(source, start) {
	if (!source.startsWith('</', start)) return null
	const marker = readInterpolationMarker(source, start + 2)
	if (!marker) return null
	let cursor = marker.end
	while (cursor < source.length && /\s/.test(source[cursor])) cursor++
	if (source[cursor] !== '>') return null
	return {
		componentIndex: marker.index,
		start,
		end: cursor + 1,
	}
}

/**
 * @param {string} source
 * @param {number} start
 * @returns {{ componentIndex: number, start: number, end: number } | null}
 */
function findMatchingComponentClose(source, start) {
	let depth = 1
	let cursor = start
	while (cursor < source.length) {
		if (source.startsWith('<!--', cursor)) {
			const commentEnd = source.indexOf('-->', cursor + 4)
			cursor = commentEnd === -1 ? source.length : commentEnd + 3
			continue
		}
		const close = readDynamicComponentClose(source, cursor)
		if (close) {
			depth--
			if (!depth) return close
			cursor = close.end
			continue
		}
		const open = readDynamicComponentOpen(source, cursor)
		if (open) {
			if (!open.selfClosing) depth++
			cursor = open.end
			continue
		}
		cursor++
	}
	return null
}

/**
 * @param {string} attributesSource
 * @returns {ComponentBinding[]}
 */
function parseComponentBindings(attributesSource) {
	/** @type {ComponentBinding[]} */
	const bindings = []
	let cursor = 0
	while (cursor < attributesSource.length) {
		while (cursor < attributesSource.length && /\s/.test(attributesSource[cursor])) cursor++
		if (cursor >= attributesSource.length) break

		if (attributesSource.startsWith('...', cursor)) {
			const marker = readInterpolationMarker(attributesSource, cursor + 3)
			if (marker) {
				bindings.push(/** @type {ComponentBinding} */ ({type: 'spread', index: marker.index}))
				cursor = marker.end
				continue
			}
		}

		const nameStart = cursor
		while (cursor < attributesSource.length && !/[\s=>]/.test(attributesSource[cursor])) cursor++
		const name = attributesSource.slice(nameStart, cursor)
		if (!name) break

		while (cursor < attributesSource.length && /\s/.test(attributesSource[cursor])) cursor++
		if (attributesSource[cursor] !== '=') {
			bindings.push(/** @type {ComponentBinding} */ ({type: 'prop', name, parts: null}))
			continue
		}

		cursor++
		while (cursor < attributesSource.length && /\s/.test(attributesSource[cursor])) cursor++
		let rawValue = ''
		if (attributesSource[cursor] === '"' || attributesSource[cursor] === "'") {
			const quote = attributesSource[cursor++]
			const valueStart = cursor
			while (cursor < attributesSource.length && attributesSource[cursor] !== quote) cursor++
			rawValue = attributesSource.slice(valueStart, cursor)
			cursor++
		} else {
			const valueStart = cursor
			while (cursor < attributesSource.length && !/\s/.test(attributesSource[cursor])) cursor++
			rawValue = attributesSource.slice(valueStart, cursor)
		}

		bindings.push(/** @type {ComponentBinding} */ ({type: 'prop', name, parts: parseInterpolationParts(rawValue)}))
	}
	return bindings
}

/**
 * @param {TemplateStringsArray} strings
 * @returns {CompiledComponentTemplate | null}
 */
function compileComponentTemplate(strings) {
	let compiled = componentTemplateCache.get(strings)
	if (compiled) return compiled

	const source = strings.reduce(
		(htmlString, string, index) =>
			htmlString +
			string +
			(index < strings.length - 1 ? `${INTERPOLATION_MARKER}${index}${INTERPOLATION_MARKER}` : ''),
		'',
	)
	/** @type {MutableTemplateStringsArray} */
	const outputStrings = Object.assign([''], {raw: ['']})
	/** @type {ComponentTemplateEntry[]} */
	const outputValues = []
	let cursor = 0
	let foundComponentSyntax = false

	while (cursor < source.length) {
		const open = readDynamicComponentOpen(source, cursor)
		if (open) {
			foundComponentSyntax = true
			let childrenSource = null
			let end = open.end
			if (!open.selfClosing) {
				const close = findMatchingComponentClose(source, open.end)
				if (!close) throw new Error('Pepper component tag is missing a matching closing tag.')
				childrenSource = source.slice(open.end, close.start)
				end = close.end
			}
			outputValues.push({
				type: 'component',
				componentIndex: open.componentIndex,
				bindings: parseComponentBindings(open.attributesSource),
				childrenSource,
			})
			outputStrings.push('')
			outputStrings.raw.push('')
			cursor = end
			continue
		}

		const marker = readInterpolationMarker(source, cursor)
		if (marker) {
			outputValues.push({type: 'value', index: marker.index})
			outputStrings.push('')
			outputStrings.raw.push('')
			cursor = marker.end
			continue
		}

		outputStrings[outputStrings.length - 1] += source[cursor++]
	}

	compiled = foundComponentSyntax ? {strings: /** @type {TemplateStringsArray} */ (outputStrings), values: outputValues} : null
	componentTemplateCache.set(strings, compiled)
	return compiled
}

/**
 * @param {string} source
 * @returns {SourceTemplate}
 */
function getSourceTemplate(source) {
	let compiled = sourceTemplateCache.get(source)
	if (compiled) return compiled
	/** @type {MutableTemplateStringsArray} */
	const strings = Object.assign([''], {raw: ['']})
	const indices = []
	let cursor = 0
	while (cursor < source.length) {
		const marker = readInterpolationMarker(source, cursor)
		if (marker) {
			indices.push(marker.index)
			strings.push('')
			strings.raw.push('')
			cursor = marker.end
			continue
		}
		strings[strings.length - 1] += source[cursor++]
	}
	compiled = {indices, strings: /** @type {TemplateStringsArray} */ (strings)}
	sourceTemplateCache.set(source, compiled)
	return compiled
}

/**
 * @param {(strings: TemplateStringsArray, ...values: unknown[]) => unknown} tag
 * @param {string} source
 * @param {unknown[]} values
 * @returns {unknown}
 */
function renderSourceTemplate(tag, source, values) {
	const compiled = getSourceTemplate(source)
	return tag(compiled.strings, ...compiled.indices.map(index => values[index]))
}

/**
 * @param {CompiledComponentTemplate | null} compiled
 * @param {unknown[]} values
 * @param {(descriptor: ComponentDescriptor, values: unknown[], index: number) => unknown} createComponentValue
 * @returns {LoweredComponentTemplate | null}
 */
function lowerComponentTemplate(compiled, values, createComponentValue) {
	if (!compiled) return null
	return {
		strings: compiled.strings,
		values: compiled.values.map((entry, index) => (
			entry.type === 'value'
				? values[entry.index]
				: createComponentValue(entry, values, index)
		)),
	}
}

/**
 * @param {ComponentBinding[]} bindings
 * @param {unknown[]} values
 * @returns {{ props: Record<string, unknown>, key: unknown }}
 */
function resolveComponentProps(bindings, values) {
	/** @type {Record<string, unknown>} */
	const props = {}
	let key
	for (const binding of bindings) {
		if (binding.type === 'spread') {
			const spreadValue = values[binding.index]
			if (
				spreadValue == null ||
				spreadValue === false ||
				typeof spreadValue !== 'object' ||
				Array.isArray(spreadValue)
			) continue
			for (const [name, value] of Object.entries(spreadValue)) {
				if (name === 'key') key = value
				else props[name] = value
			}
			continue
		}
		const value = resolveParts(binding.parts, values)
		if (binding.name === 'key') key = value
		else props[binding.name] = value
	}
	return {props, key}
}

export {
	compileComponentTemplate,
	lowerComponentTemplate,
	renderSourceTemplate,
	resolveComponentProps,
}
