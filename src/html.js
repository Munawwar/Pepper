/**
 * A Pepper `html` template tag function for declarative DOM creation and updates.
 *
 * @param {TemplateStringsArray} strings
 * @param {...InterpolationValue} values
 * @returns {(key?: any, liveNodes?: Node[]) => TemplateNodes} A function that
 * accepts a key for template instance identity, and optionally a live node
 * slice to hydrate in place, and returns DOM nodes rendered with the given
 * values.
 */
export function html(strings, ...values) {
	return handleTemplateTag('html', strings, ...values)
}

/**
 * A Pepper `svg` template tag function for declarative SVG DOM creation and updates.
 *
 * @param {TemplateStringsArray} strings
 * @param {...InterpolationValue} values
 * @returns {(key?: any, liveNodes?: Node[]) => TemplateNodes} A function that
 * accepts a key for template instance identity, and optionally a live node
 * slice to hydrate in place, and returns SVG DOM nodes rendered with the given
 * values.
 */
export function svg(strings, ...values) {
	return handleTemplateTag('svg', strings, ...values)
}

/**
 * A Pepper `mathml` template tag function for declarative MathML DOM creation and updates.
 *
 * @param {TemplateStringsArray} strings
 * @param {...InterpolationValue} values
 * @returns {(key?: any, liveNodes?: Node[]) => TemplateNodes} A function that
 * accepts a key for template instance identity, and optionally a live node
 * slice to hydrate in place, and returns MathML DOM nodes rendered with the
 * given values.
 */
export function mathml(strings, ...values) {
	return handleTemplateTag('mathml', strings, ...values)
}

/** Unique symbol to mark force wrapped values */
const FORCE_SYMBOL = Symbol('force')
const UNSAFE_HTML_SYMBOL = Symbol('unsafe-html')
const UNSAFE_SVG_SYMBOL = Symbol('unsafe-svg')
const UNSAFE_MATHML_SYMBOL = Symbol('unsafe-mathml')
const RAW_TEXT_SYMBOL = Symbol('raw-text')
const TRUSTED_TEXT_INPUT_ERROR = 'unsafeHTML(), unsafeSVG(), unsafeMathML(), and rawText() expect a string.'
const TRUSTED_TEXT_CONTEXT_ERROR =
	'unsafeHTML(), unsafeSVG(), unsafeMathML(), and rawText() are only allowed in text content interpolation.'

/**
 * Wrap a value in `force()` to indicate that it should not be checked for
 * changes when applying updates.
 *
 * @param {InterpolationValue} value
 */
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

/** @param {string} value */
export function unsafeHTML(value) {
	return wrapTrustedTextValue(UNSAFE_HTML_SYMBOL, value)
}

/** @param {string} value */
export function unsafeSVG(value) {
	return wrapTrustedTextValue(UNSAFE_SVG_SYMBOL, value)
}

/** @param {string} value */
export function unsafeMathML(value) {
	return wrapTrustedTextValue(UNSAFE_MATHML_SYMBOL, value)
}

/** @param {string} value */
export function rawText(value) {
	return wrapTrustedTextValue(RAW_TEXT_SYMBOL, value)
}

/**
 * Check if a value is wrapped with force()
 * @param {InterpolationValue} value
 * @returns {boolean}
 */
function isForceWrapped(value) {
	return typeof value === 'object' && value !== null && FORCE_SYMBOL in value
}

/**
 * Unwrap a force wrapped value
 * @param {InterpolationValue} value
 * @returns {InterpolationValue}
 */
function unwrapForce(value) {
	if (isForceWrapped(value)) return /** @type {any} */ (value)[FORCE_SYMBOL]
	return value
}

/**
 * @param {InterpolationValue} value
 * @returns {value is TrustedTextValue}
 */
function isTrustedTextValue(value) {
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
 * @returns {string | Node[]}
 */
function resolveTrustedTextValue(value) {
	if (RAW_TEXT_SYMBOL in value) return value[RAW_TEXT_SYMBOL] || ''
	if (!(UNSAFE_HTML_SYMBOL in value || UNSAFE_SVG_SYMBOL in value || UNSAFE_MATHML_SYMBOL in value)) return ''

	const template = document.createElement('template')
	let htmlString = value[UNSAFE_HTML_SYMBOL] || value[UNSAFE_SVG_SYMBOL] || value[UNSAFE_MATHML_SYMBOL] || ''
	const mode = UNSAFE_SVG_SYMBOL in value ? 'svg' : UNSAFE_MATHML_SYMBOL in value ? 'mathml' : 'html'

	if (mode === 'svg') htmlString = `<svg>${htmlString}</svg>`
	else if (mode === 'mathml') htmlString = `<math>${htmlString}</math>`

	template.innerHTML = htmlString

	if (mode === 'svg' || mode === 'mathml') {
		const wrapper = /** @type {Element | null} */ (template.content.firstElementChild)
		if (wrapper) wrapper.replaceWith(...wrapper.childNodes)
	}

	return Array.from(template.content.childNodes)
}

/**
 * Handle force detection and unwrapping for a site
 * @param {InterpolationSite} site
 * @param {InterpolationValue} value
 * @returns {InterpolationValue} The unwrapped value
 */
function handleForceValue(site, value) {
	const isWrapped = isForceWrapped(value)

	if (site.requiresUnwrapping) {
		// This site has been marked as requiring unwrapping
		if (!isWrapped) {
			throw new Error(
				'Value must be wrapped with force() for this interpolation site. Once force() is used at a site, it must always be used.',
			)
		}
		return unwrapForce(value)
	} else if (isWrapped) {
		// First time seeing force at this site
		site.skipEqualityCheck = true
		site.requiresUnwrapping = true
		return unwrapForce(value)
	}

	// Normal value, no unwrapping needed
	return value
}

/**
 * @param {TemplateMode} mode
 * @param {TemplateStringsArray} strings
 * @param {...InterpolationValue} values
 * @returns {(key?: any, liveNodes?: Node[]) => TemplateNodes} A function that
 * accepts a key for template instance identity, and optionally a live node
 * slice to hydrate in place, and returns DOM nodes rendered with the given
 * values.
 */
function handleTemplateTag(mode, strings, ...values) {
	const template = parseTemplate(strings, mode)
	/** @type {((key?: any, liveNodes?: Node[]) => TemplateNodes) & {template: Template}} */
	const renderFn = function (key = Symbol(), liveNodes) {
		template.values = values
		return liveNodes
			? template.hydrateInstance(
					key,
					/** @type {Element | ShadowRoot | DocumentFragment} */ (liveNodes[0]?.parentNode),
					liveNodes,
				)
			: template.updateInstance(key)
	}
	renderFn.template = template
	return renderFn
}

/**
 * Template cache based on template strings (source location)
 * @type {WeakMap<TemplateStringsArray, Template>}
 */
const templateCache = new WeakMap()

/** Unique marker for interpolation sites */
const INTERPOLATION_MARKER = '⧙⧘'

/** RegExp for matching interpolation markers */
const INTERPOLATION_REGEXP = new RegExp(`${INTERPOLATION_MARKER}(\\d+)${INTERPOLATION_MARKER}`)
const SPREAD_INTERPOLATION_REGEXP = new RegExp(`^\\.\\.\\.${INTERPOLATION_MARKER}(\\d+)${INTERPOLATION_MARKER}`)
const SPREAD_PLACEHOLDER_ATTR_PREFIX = `x-${INTERPOLATION_MARKER}spread-`
const SPREAD_PLACEHOLDER_ATTR_REGEXP = new RegExp(`^${SPREAD_PLACEHOLDER_ATTR_PREFIX}(\\d+)${INTERPOLATION_MARKER}$`)

/** Regex for finding HTML opening/self-closing tags */
const HTML_TAG_REGEXP = /<[^<>]*?\/?>/g

const ATTRIBUTE_END_REGEXP = /[\s=/>]/

/**
 * Parse parts array, converting alternating indices to numbers
 * @param {string[]} parts
 * @param {boolean} isTopLevel - Whether this text node is at the top level of the template
 * @returns {(string|number)[]}
 */
function parseInterpolationParts(parts, isTopLevel = false) {
	let mapped = parts.map((part, i) => (i % 2 === 1 ? parseInt(part) : part))

	// For top-level text nodes, filter out whitespace-only string parts
	// For text nodes inside elements, preserve all parts including whitespace
	if (isTopLevel) mapped = mapped.filter(part => typeof part === 'number' || part.trim() !== '')

	return mapped
}

/**
 * Join parts with value substitution
 * @param {(string|number)[]} parts
 * @param {InterpolationValue[]} values
 * @returns {string}
 */
function joinPartsWithValues(parts, values) {
	return parts
		.map((/** @type {string|number} */ part) => (typeof part === 'number' ? String(values[part] ?? '') : part))
		.join('')
}

/**
 * Split text nodes containing interpolation markers into separate text nodes.
 * This is done once during template creation.
 * @param {DocumentFragment} fragment
 */
function splitTextNodesWithInterpolation(fragment) {
	const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT, null)
	let textNode = /** @type {Text | null} */ (walker.nextNode())

	while (textNode) {
		// Collect the next node first, so we don't break iteration when replacing the current node.
		const nextNode = /** @type {Text | null} */ (walker.nextNode())
		const textContent = textNode.textContent || ''

		// Split each text node with an interpolation
		if (textContent.includes(INTERPOLATION_MARKER)) {
			// Check if this text node is a direct child of the template fragment (top level)
			const isTopLevel = textNode.parentNode === fragment
			const parts = textContent.split(INTERPOLATION_REGEXP)
			const parsedParts = parseInterpolationParts(parts, isTopLevel)

			// Only split if we have more than one part (static text + interpolations)
			if (parsedParts.length > 1) {
				const newTextNodes = parsedParts.map(
					part => new Text(typeof part === 'number' ? `${INTERPOLATION_MARKER}${part}${INTERPOLATION_MARKER}` : part),
				)

				// Replace the original text node with the split text nodes
				// (static, interpolated, static, interpolated, etc)
				textNode.replaceWith(...newTextNodes)
			}
		}

		textNode = nextNode
	}
}

class Template {
	/** @type {WeakMap<TemplateKey, TemplateInstance>} */
	instances = new WeakMap()
	el = document.createElement('template')
	caseMappings = new Map()

	/**
	 * @param {TemplateMode} mode
	 * @param {TemplateStringsArray} strings
	 */
	constructor(strings, mode) {
		// Join strings with interpolation markers
		let htmlString = strings.reduce(
			(acc, str, i) => acc + str + (i < strings.length - 1 ? `${INTERPOLATION_MARKER}${i}${INTERPOLATION_MARKER}` : ''),
			'',
		)

		// Wrap content in appropriate root elements for SVG and MathML modes
		// so that the HTML parser creates elements with correct namespaces
		if (mode === 'svg') htmlString = `<svg>${htmlString}</svg>`
		else if (mode === 'mathml') htmlString = `<math>${htmlString}</math>`

		const {caseMappings, el} = this

		// Preprocessing for case sensitivity: map .someProp to .someprop and remember the original
		let counter = 0

		// How the case-preserved${count} works:
		// 1. We replace all .someProp, .otherProp, etc with .case-preserved0,
		//    .case-preserved1, etc and store the mapping from .case-preserved0 ->
		//    someProp, .case-preserved1 -> otherProp, etc in caseMappings.
		// 2. Later, when processing the attributes, we can look up the original
		//    case-sensitive property name using the placeholder.
		// 3. This allows us to avoid issues with HTML attribute names being
		//    case-insensitive, while still preserving the original case for JS
		//    property names so we can set them correctly on the elements.

		// Scan for HTML tags and process spread/.property attributes within each tag
		htmlString = htmlString.replace(HTML_TAG_REGEXP, tagMatch => {
			// Parse the tag content more carefully to avoid matching spread/property
			// syntax inside quoted attribute values.
			const parts = []
			let lastIndex = 0
			let inQuotes = false
			let quoteChar = ''
			let i = 0

			while (i < tagMatch.length) {
				const char = tagMatch[i]

				if (!inQuotes && (char === '"' || char === "'")) {
					inQuotes = true
					quoteChar = char
				} else if (inQuotes && char === quoteChar) {
					inQuotes = false
					quoteChar = ''
				} else if (!inQuotes && i > 0 && /\s/.test(tagMatch[i - 1])) {
					const spreadMatch = tagMatch.slice(i).match(SPREAD_INTERPOLATION_REGEXP)
					if (spreadMatch) {
						parts.push(tagMatch.slice(lastIndex, i))
						parts.push(`${SPREAD_PLACEHOLDER_ATTR_PREFIX}${spreadMatch[1]}${INTERPOLATION_MARKER}=""`)
						lastIndex = i + spreadMatch[0].length
						i = lastIndex - 1
						continue
					}

					// Detect attribute patterns when preceded by whitespace and not in quotes
					let prefix = null

					// Detect different attribute patterns
					if (char === '.' || char === '@') {
						// Case 1: .prop or @event (case-sensitive attributes)
						prefix = char
					} else if (char === '!' && i + 1 < tagMatch.length) {
						const nextChar = tagMatch[i + 1]
						// Case 2: !@event (forced case-sensitive event attributes)
						if (nextChar === '.') prefix = '!.'
						// Case 3: !.prop (forced case-sensitive property attributes)
						if (nextChar === '@') prefix = '!@'
						// Case 4: !?attr (forced boolean attributes, no special handling needed)
						else if (nextChar === '?') prefix = null
						// Case 5: !attr (forced regular attributes, no special handling needed)
						else if (/[a-zA-Z]/.test(nextChar)) prefix = null
					}

					// Process case-sensitive attributes
					if (prefix) {
						const startIndex = i
						const attrStartIndex = startIndex + prefix.length
						let attrEnd = attrStartIndex

						while (attrEnd < tagMatch.length && !ATTRIBUTE_END_REGEXP.test(tagMatch[attrEnd])) attrEnd++

						if (attrEnd > attrStartIndex) {
							// Extract the attribute name
							const attrName = tagMatch.slice(attrStartIndex, attrEnd)
							let placeholder

							// Properties and events use case-preserved placeholders
							placeholder = `${prefix}case-preserved${counter}`
							const hasForce = prefix.startsWith('!')
							caseMappings.set(placeholder.slice(hasForce ? 2 : 1), attrName)

							counter++

							// Add the part before this replacement
							parts.push(tagMatch.slice(lastIndex, startIndex))
							parts.push(placeholder) // Add the placeholder (skip ! for case-sensitive attributes)
							lastIndex = attrEnd // Update tracking
							i = attrEnd - 1 // -1 because the loop will increment
						}
					}
				}
				i++
			}

			parts.push(tagMatch.slice(lastIndex)) // Add the remaining part

			return parts.join('')
		})

		// Use the standard HTML parser to parse the string into a template document
		el.innerHTML = htmlString

		// For SVG and MathML templates, unwrap the content from the wrapper
		// element that was added during parsing, and remove the wrapper, to
		// ensure proper namespace handling.
		if (mode === 'svg' || mode === 'mathml') {
			const wrapperElement = /** @type {Element} */ (el.content.firstElementChild)
			wrapperElement.replaceWith(...wrapperElement.childNodes)
		}

		// Pre-split text nodes that contain interpolation markers
		// This is done once during template creation for better performance
		splitTextNodesWithInterpolation(el.content)

		// Remove empty whitespace-only text nodes, from the top level of the
		// template only, for the convenience of being able to easily get references
		// to top level nodes. This allows usage like the following for a single top
		// level element:
		//
		// ```js
		// const div = html`
		//   <div>
		//     ...
		//   </div>
		// `()
		// ```
		//
		// Text nodes that are not direct children of the template (f.e. inside
		// elements) are not removed, to preserve whitespace where it may be
		// significant.
		//
		// This only removes text nodes that are entirely static whitespace. Text
		// nodes that contain interpolation markers, or non-whitespace content, are
		// preserved. This allows getting access to top level text nodes that may
		// contain important content. For example:
		//
		// ```js
		// const nodes = html`
		//   ${someDynamicContent}
		//   <div>...</div>
		// `()
		// const textNode = nodes[0]; // Access the dynamic text node
		// const div = nodes[1]; // Access the div element
		// ```
		//
		// If you need whitespace to be preserved, consider using explicit markers
		// like `${' '}` for spaces at the top level, or wrapping text in elements.
		// For example:
		//
		// ```js
		// const nodes = html`
		//   <pre>
		//     All text inside elements is preserved, including whitespace.
		//     ${someDynamicContent}
		//   </pre>
		//   ${' '/* this explicit whitespace is preserved */}
		//   <span>...</span>
		//   This text node without whitespace is also preserved.
		// `()
		//
		// const pre = nodes[0];
		// const textNode = nodes[1]; // This is the explicit whitespace text node
		// const span = nodes[2];
		// const textNode2 = nodes[3]; // This is the static text node
		// ```
		//
		// This makes accessing top level nodes easy, based on the visual structure
		// of the template.
		for (const node of el.content.childNodes) {
			if (node.nodeType !== Node.TEXT_NODE) continue
			if (!(node.textContent || '').includes(INTERPOLATION_MARKER) && (node.textContent || '').trim() === '')
				node.remove()
		}
	}

	/**
	 * @param {TemplateKey} key The key for the template instance
	 * @returns {TemplateInstance}
	 */
	getInstance(key) {
		let templateInstance = this.instances.get(key)

		// Create a new instance if not cached yet
		if (!templateInstance) {
			// Create a new template instance.
			// We're using importNode instead of cloneNode to ensure that custom
			// elements are properly upgraded immediately when cloned, to avoid
			// users facing issues with un-upgraded elements in templates prior
			// to users connecting the elements to the DOM (issues like a
			// template .prop= expression setting a property before the element
			// is upgraded, shadowing getters/setters and breaking reactivity,
			// causing confusion and frustration).
			const fragment = document.importNode(this.el.content, true) // deep clone

			const sites = findInterpolationSites(fragment, this.caseMappings)
			const nodes = /** @type {TemplateNodes} */ (Object.freeze(Array.from(fragment.childNodes)))

			templateInstance = new TemplateInstance(nodes, sites)

			this.instances.set(key, templateInstance)
		}

		return templateInstance
	}

	/** @type {InterpolationValue[]} */
	values = []

	/**
	 * Update instance with new values. This gets returned by the `html`
	 * function for users to call with their keys.
	 *
	 * @param {TemplateKey} key
	 */
	updateInstance = (key = Symbol()) => {
		const templateInstance = this.getInstance(key)
		templateInstance.applyValues(this.values)
		const renderedNodes = templateInstance.getRenderedNodes()
		trackTemplateInstanceNodes(templateInstance, renderedNodes)
		return renderedNodes
	}

	/**
	 * Hydrate an existing DOM subtree into a template instance, reusing matching
	 * nodes and replacing mismatches with the template-owned nodes.
	 *
	 * @param {TemplateKey} key
	 * @param {Element | ShadowRoot | DocumentFragment} container
	 * @param {Node[]} liveNodes
	 */
	hydrateInstance = (key, container, liveNodes) => {
		const templateInstance = this.getInstance(key)
		templateInstance.applyValues(this.values)

		/** @type {Map<Node, Node>} */
		const adoptionMap = new Map()
		reconcileHydrationNodes(
			container,
			liveNodes,
			/** @type {Node[]} */ ([...templateInstance.nodes]),
			adoptionMap,
			liveNodes[liveNodes.length - 1]?.nextSibling || null,
		)

		templateInstance.absorb(adoptionMap)
		const renderedNodes = templateInstance.getRenderedNodes()
		trackTemplateInstanceNodes(templateInstance, renderedNodes)
		return renderedNodes
	}
}

/**
 * Create a Template containing a `<template>` with the DOM representation of
 * the HTML for cloning into "template instances", and other data, associated
 * with the given template strings.
 *
 * @param {TemplateMode} mode
 * @param {TemplateStringsArray} strings
 *
 * @returns {Template} The Template instance contains a `<template>` element
 * with the DOM representation of the HTML, with interpolation markers in place,
 * to be cloned when we create any "instance" of the template.
 */
function parseTemplate(strings, mode) {
	let template = templateCache.get(strings)
	if (!template) templateCache.set(strings, (template = new Template(strings, mode)))
	return template
}

/**
 * Find interpolation sites in template
 * @param {DocumentFragment} fragment
 * @param {Map<string, string>} caseMappings
 * @returns {InterpolationSite[]}
 */
function findInterpolationSites(fragment, caseMappings) {
	/** @type {InterpolationSite[]} */
	const sites = []
	const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null)

	let node
	while ((node = walker.nextNode())) {
		if (node.nodeType === Node.TEXT_NODE) {
			const textNode = /** @type {Text} */ (node)
			const textContent = textNode.textContent || ''
			if (textContent.includes(INTERPOLATION_MARKER)) {
				// Since text nodes are now pre-split, each text node should contain exactly one interpolation marker
				// Extract the interpolation index from the marker
				const match = textContent.match(INTERPOLATION_REGEXP)
				if (match) {
					const interpolationIndex = parseInt(match[1])
					textNode.textContent = '' // Clear the text node content; it will be filled during interpolation
					sites.push({node: textNode, type: /** @type {'text'} */ ('text'), interpolationIndex})
				}
			}
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const element = /** @type {Element} */ (node)
			const elementState = {}

			// A list of placeholder attributes to remove after finding
			// interpolation sites (f.e. !foo="" is removed, as it will be set
			// dynamically later)
			const attributesToRemove = []

			for (const attr of element.attributes) {
				const name = attr.name
				const value = attr.value
				const spreadMatch = name.match(SPREAD_PLACEHOLDER_ATTR_REGEXP)

				if (spreadMatch) {
					sites.push({
						node: element,
						type: /** @type {'spread'} */ ('spread'),
						interpolationIndex: parseInt(spreadMatch[1]),
						elementState,
					})
					attributesToRemove.push(name)
					continue
				}

				if (name === 'ref' && value.includes(INTERPOLATION_MARKER)) {
					sites.push({
						node: element,
						type: /** @type {'property'} */ ('property'),
						attributeName: '__pepperRef',
						parts: parseInterpolationParts(value.split(INTERPOLATION_REGEXP), false),
						elementState,
					})
					attributesToRemove.push(name)
					continue
				}

				// Handle interpolated attrs, static special attrs, and regular attrs marked with !.
				if (
					value.includes(INTERPOLATION_MARKER) ||
					name.startsWith('?') ||
					name.startsWith('.') ||
					name.startsWith('@') ||
					name.startsWith('!')
				) {
					const isStatic = !value.includes(INTERPOLATION_MARKER)

					let parsedParts
					if (isStatic) parsedParts = [value]
					// Parse attribute value parts (for interpolated content)
					else parsedParts = parseInterpolationParts(value.split(INTERPOLATION_REGEXP), false)

					// Determine attribute type and restore case for JS properties
					/** @type {'attribute'|'boolean-attribute'|'property'|'event'} */
					let type = 'attribute'
					let processedName = '' // The name without special prefixes
					let skipEqualityCheck = name.startsWith('!')

					if (name.startsWith('?') || name.startsWith('!?')) {
						type = 'boolean-attribute'
						processedName = name.slice(skipEqualityCheck ? 2 : 1) // Extract the name after ? or !?
					} else if (name.startsWith('.') || name.startsWith('!.')) {
						type = 'property'
						const placeholder = name.slice(skipEqualityCheck ? 2 : 1) // Extract the name after . or !.
						processedName = caseMappings.get(placeholder) || placeholder
					} else if (name.startsWith('@') || name.startsWith('!@')) {
						type = 'event'
						const placeholder = name.slice(skipEqualityCheck ? 2 : 1) // Extract the name after @ or !@
						processedName = caseMappings.get(placeholder) || placeholder
					} else {
						type = 'attribute'
						processedName = skipEqualityCheck ? name.slice(1) : name // Extract name after ! if present
						// Ensure static forced attributes are set initially. Basically !foo="bar" acts like foo="bar".
						if (isStatic && skipEqualityCheck) element.setAttribute(processedName, value)
					}

					/** @type {InterpolationSite} */
					const site = {
						node: element,
						type,
						attributeName: processedName,
						parts: parsedParts,
						skipEqualityCheck,
						elementState,
					}

					sites.push(site)

					// Remove the template attribute, it will be set dynamically later
					attributesToRemove.push(name)
				} else {
					sites.push({node: element, type: 'attribute', attributeName: name, parts: [value], elementState})
				}
			}

			for (const name of attributesToRemove) element.removeAttribute(name)
		}
	}

	return sites
}

/**
 * Check if two arrays are equal
 * @param {any[]} a
 * @param {any[]} b
 * @returns {boolean}
 */
function arrayEquals(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) return false
	if (a.length !== b.length) return false
	for (let i = 0, l = a.length; i < l; i++) if (a[i] !== b[i]) return false
	return true
}

/**
 * Cache for generating stable keys for nested template functions
 * Maps interpolation site -> array of stable keys for each index
 * @type {WeakMap<InterpolationSite, symbol[]>}
 */
const siteIndexKeys = new WeakMap()
const nodeTemplateInstances = new WeakMap()

/**
 * Get a stable unique key for a template function at a specific site and index
 * @param {InterpolationSite} site
 * @param {number} index
 * @returns {symbol}
 */
function getStableNestedKey(site, index) {
	let indexKeys = siteIndexKeys.get(site)
	if (!indexKeys) siteIndexKeys.set(site, (indexKeys = []))
	let key = indexKeys[index]
	if (!key) indexKeys[index] = key = Symbol('nested-template-key' + index)
	return key
}

/**
 * @param {TemplateInstance} templateInstance
 * @param {readonly Node[]} nodes
 * @returns {void}
 */
function trackTemplateInstanceNodes(templateInstance, nodes) {
	for (const node of nodes) nodeTemplateInstances.set(node, templateInstance)
}

/**
 * @param {'attribute'|'boolean-attribute'|'property'|'event'} type
 * @param {string} name
 */
function getBindingKey(type, name) {
	if (type === 'boolean-attribute') return `?${name}`
	if (type === 'property') return `.${name}`
	if (type === 'event') return `@${name}`
	return name
}

/**
 * @param {Element} element
 * @param {string} eventName
 * @param {{ internalHandler?: EventListener, currentEventListener?: EventListener }} state
 * @param {unknown} inputValue
 */
function updateEventHandler(element, eventName, state, inputValue) {
	let eventListener
	if (typeof inputValue === 'function') eventListener = /** @type {EventListener} */ (inputValue)
	else if (typeof inputValue === 'string') eventListener = /** @type {EventListener} */ (new Function('event', inputValue))
	else if (inputValue == null || inputValue === '' || inputValue === false) eventListener = null
	else throw new TypeError(`Event handler for ${eventName} must be a function or string`)

	if (eventListener) {
		if (!state.internalHandler) {
			state.internalHandler = /** @type {EventListener} */ (event => state.currentEventListener?.(event))
			element.addEventListener(eventName, state.internalHandler)
		}
		state.currentEventListener = eventListener
		return true
	}

	if (state.internalHandler) {
		element.removeEventListener(eventName, state.internalHandler)
		state.internalHandler = undefined
		state.currentEventListener = undefined
	}

	return false
}

const ATTRIBUTE_SITE_ERROR =
	'Nested templates and DOM elements are not allowed in attributes. Use text content interpolation instead.'

/**
 * @param {InterpolationSite} site
 * @param {InterpolationValue[]} values
 */
function resolveSiteValue(site, values) {
	const parts = site.parts || []

	if (parts.length === 3 && parts[0] === '' && parts[2] === '' && typeof parts[1] === 'number')
		return handleForceValue(site, values[parts[1]])

	const processedValues = [...values]
	for (const part of parts) if (typeof part === 'number') processedValues[part] = handleForceValue(site, values[part])
	return joinPartsWithValues(parts, processedValues)
}

/**
 * Reconcile one ordered list of DOM nodes to another using strict node
 * identity. This keeps the cheap fast paths for matching heads/tails and
 * adjacent head/tail swaps, and otherwise replaces the unmatched middle.
 *
 * @param {Element | DocumentFragment | Document} parentNode
 * @param {Node[]} oldNodes
 * @param {Node[]} newNodes
 * @param {Node | null} [endBoundaryNode]
 * @returns {Node[]}
 */
function reconcileDom(parentNode, oldNodes, newNodes, endBoundaryNode = null) {
	let oldStart = 0
	let oldEnd = oldNodes.length
	let newStart = 0
	let newEnd = newNodes.length
	const startBoundaryNode = oldNodes[0]?.previousSibling || endBoundaryNode?.previousSibling || null

	// Thanks to https://github.com/WebReflection/udomdiff for the fast path inspiration.
	while (oldStart < oldEnd || newStart < newEnd) {
		// fast path to append head or tail
		if (oldEnd === oldStart) {
			while (newStart < newEnd) {
				const node = newNodes[newStart++]
				if ('moveBefore' in parentNode && node.parentNode === parentNode)
					/** @type {(node: Node, child: Node | null) => Node} */ (parentNode.moveBefore)(node, endBoundaryNode)
				else parentNode.insertBefore(node, endBoundaryNode)
			}
			// fast path to remove head or tail
		} else if (newEnd === newStart) {
			while (oldStart < oldEnd) /** @type {ChildNode} */ (oldNodes[oldStart++]).remove()
			// fast path for same head
		} else if (oldNodes[oldStart] === newNodes[newStart]) {
			oldStart++
			newStart++
			// fast path for same tail
		} else if (oldNodes[oldEnd - 1] === newNodes[newEnd - 1]) {
			oldEnd--
			newEnd--
			// fast path for swaps
		} else if (
			oldStart < oldEnd - 1 &&
			newStart < newEnd - 1 &&
			oldNodes[oldStart] === newNodes[newEnd - 1] &&
			oldNodes[oldEnd - 1] === newNodes[newStart]
		) {
			// Adjacent head/tail swaps are common enough to be worth a dedicated
			// fast path. This also handles patterns like:
			//          ↓     ↓
			// old: [1, 2, 3, 4, 5]
			//          ↓     ↓
			// new: [1, 4, 3, 2, 5]
			//
			// or another case:
			//                ↓  ↓
			// old: [1, 2, 3, 4, 5]
			//                ↓     ↓
			// new: [1, 2, 3, 5, 6, 4]
			newStart++
			newEnd--
			const oldStartNode = oldNodes[oldStart++]
			const oldEndNode = oldNodes[--oldEnd]
			const startInsertBefore = oldStartNode.nextSibling
			const safeInsertBefore = startInsertBefore?.parentNode === parentNode ? startInsertBefore : endBoundaryNode
			if ('moveBefore' in parentNode && oldStartNode.parentNode === parentNode)
				/** @type {(node: Node, child: Node | null) => Node} */ (parentNode.moveBefore)(
					oldStartNode,
					oldEndNode.nextSibling,
				)
			else parentNode.insertBefore(oldStartNode, oldEndNode.nextSibling)
			// If the two nodes were adjacent siblings then they are already swapped
			// now, so ignore that case.
			if (startInsertBefore !== oldEndNode && oldEndNode.parentNode === parentNode) {
				if ('moveBefore' in parentNode && oldEndNode.parentNode === parentNode)
					/** @type {(node: Node, child: Node | null) => Node} */ (parentNode.moveBefore)(oldEndNode, safeInsertBefore)
				else parentNode.insertBefore(oldEndNode, safeInsertBefore)
			}
			// slow path for the unmatched middle
		} else {
			// To keep it simple, just (re-)insert the unmatched middle before endBoundary.
			const lastSettledNode = newNodes[newStart - 1] || null
			const endBoundary = newNodes[newEnd] || endBoundaryNode
			const firstPendingNode = newNodes[newStart] || endBoundary
			while (newStart < newEnd) {
				const node = newNodes[newStart++]
				if ('moveBefore' in parentNode && node.parentNode === parentNode)
					/** @type {(node: Node, child: Node | null) => Node} */ (parentNode.moveBefore)(node, endBoundary)
				else parentNode.insertBefore(node, endBoundary)
			}
			// DOM should look like this now:
			// [potentially some new nodes][remnant old nodes][new nodes][endBoundary]
			// The remnant old nodes must be removed. We noted down lastSettledNode and
			// firstPendingNode, so everything in between can be removed.
				let node = lastSettledNode
					? lastSettledNode.nextSibling
					: startBoundaryNode
					? startBoundaryNode.nextSibling
					: parentNode.firstChild
			while (node && node !== firstPendingNode) {
				const nextSibling = node.nextSibling
				const removableNode = /** @type {ChildNode} */ (node)
				removableNode.remove()
				node = nextSibling
			}
			break
		}
	}

	return newNodes
}

function interpolateTextSite(/** @type {InterpolationSite} */ site, /** @type {InterpolationValue} */ value) {
	// Handle force detection and unwrapping
	let unwrappedValue = handleForceValue(site, value)
	if (isTrustedTextValue(unwrappedValue)) unwrappedValue = resolveTrustedTextValue(unwrappedValue)

	if (!site.skipEqualityCheck && site.lastValue === unwrappedValue) return // No change
	site.lastValue = unwrappedValue

	// Handle simple text cases first (most common case)
	if (!(unwrappedValue instanceof Node) && !Array.isArray(unwrappedValue) && typeof unwrappedValue !== 'function') {
		// Simple text content, just set textContent
		if (site.insertedNodes) for (const node of site.insertedNodes) /** @type {ChildNode} */ (node).remove()
		site.node.textContent = String(unwrappedValue ?? '')
		site.insertedNodes = undefined
	} else {
		// Handle complex cases that produce DOM nodes
		// Convert single values to arrays for uniform processing
		const itemsToProcess = Array.isArray(unwrappedValue) ? unwrappedValue : [unwrappedValue]

		const nodes = /** @type {(Element | Text)[]} */ (
			itemsToProcess
				.flatMap((item, index) => {
					// Handle template functions - call them to get their nodes
					if (typeof item === 'function') {
						// Each interpolation site gets its own unique identity for nested template functions.
						// We generate a stable key combining the site identity with the array index to ensure
						// template functions at the same site but different positions don't share cache entries,
						// even when using the same mapper function (e.g., html`<ul>${items.map(itemMapper)}</ul>`).
						const stableKey = getStableNestedKey(site, index)
						item = item(stableKey)
					}
					if (isTrustedTextValue(item)) item = resolveTrustedTextValue(item)
					// Handle arrays (already processed template results)
					// Flatten one level because html functions return arrays
					if (Array.isArray(item)) return item.flat(1)
					// Handle single nodes or primitive values
					return [item]
				})
				.flatMap(item => {
					if (isTrustedTextValue(item)) item = resolveTrustedTextValue(item)
					if (Array.isArray(item)) return item.flat(Infinity)
					if (item instanceof Node) return /** @type {Element | Text} */ (item)
					if (item != null && item !== '') return [new Text(String(item))]
					return []
				})
		)

		if (!site.skipEqualityCheck && site.insertedNodes && arrayEquals(site.insertedNodes, nodes)) return // No change
		const parentNode = site.node.parentNode
		if (!parentNode) {
			site.node.textContent = ''
			site.insertedNodes = nodes.length ? [...nodes] : undefined
			return
		}

		const reconciledNodes = /** @type {(Element | Text)[]} */ (
			reconcileDom(
				/** @type {Element | DocumentFragment | Document} */ (parentNode),
				site.insertedNodes || [],
				nodes,
				site.node,
			)
		)
		site.node.textContent = ''
		site.insertedNodes = reconciledNodes.length ? reconciledNodes : undefined
	}
}

/**
 * Map a node subtree to itself for nodes that remain template-owned after
 * hydration fallback replacement.
 *
 * @param {Map<Node, Node>} adoptionMap
 * @param {Node} root
 */
function adoptSubtree(adoptionMap, root) {
	const nodes = [root]

	while (nodes.length) {
		const node = /** @type {Node} */ (nodes.pop())
		adoptionMap.set(node, node)
		for (let child = node.lastChild; child; child = child.previousSibling) nodes.push(child)
	}
}

/**
 * Compare whether a live node can be adopted in place for hydration.
 *
 * @param {Node} liveNode
 * @param {Node} targetNode
 */
function canHydrateNode(liveNode, targetNode) {
	if (liveNode.nodeType !== targetNode.nodeType) return false
	if (liveNode.nodeType === Node.COMMENT_NODE) return liveNode.nodeValue === targetNode.nodeValue
	// text and cdata would be patched anyway
	if (liveNode.nodeType === Node.TEXT_NODE || liveNode.nodeType === Node.CDATA_SECTION_NODE) return true
	if (liveNode.nodeType !== Node.ELEMENT_NODE) return liveNode.isEqualNode(targetNode)

	// For elements, compare tag name, namespace and attributes
	const liveElement = /** @type {Element} */ (liveNode)
	const targetElement = /** @type {Element} */ (targetNode)

	if (
		liveElement.namespaceURI !== targetElement.namespaceURI ||
		liveElement.tagName !== targetElement.tagName ||
		liveElement.attributes.length !== targetElement.attributes.length
	)
		return false

	for (const attr of targetElement.attributes) if (liveElement.getAttribute(attr.name) !== attr.value) return false

	return true
}

/**
 * Reuse matching live DOM nodes and replace mismatches with template-owned
 * nodes, walking children in order without keyed diffing.
 *
 * @param {Element | ShadowRoot | DocumentFragment | Element} parentNode
 * @param {Node[]} liveNodes
 * @param {Node[]} targetNodes
 * @param {Map<Node, Node>} adoptionMap
 * @param {Node | null} nextSibling
 */
function reconcileHydrationNodes(parentNode, liveNodes, targetNodes, adoptionMap, nextSibling = null) {
	let liveIndex = 0
	let targetIndex = 0

	while (liveIndex < liveNodes.length || targetIndex < targetNodes.length) {
		const liveNode = liveNodes[liveIndex]
		const targetNode = targetNodes[targetIndex]

		if (!liveNode && targetNode) {
			parentNode.insertBefore(targetNode, nextSibling)
			adoptSubtree(adoptionMap, targetNode)
			targetIndex++
			continue
		}

		if (liveNode && !targetNode) {
			const removableNode = /** @type {ChildNode} */ (liveNode)
			removableNode.remove()
			liveIndex++
			continue
		}

		// Attempt to a bit forgiving on whitespace differences between SSR/live DOM
		// and target DOM, before using stricter canHydrateNode() check
		if (
			liveNode.nodeType === Node.TEXT_NODE &&
			liveNode.nodeValue?.trim() === '' &&
			targetNode.nodeType !== Node.TEXT_NODE &&
			!(parentNode instanceof Element && parentNode.tagName === 'PRE')
		) {
			const removableNode = /** @type {ChildNode} */ (liveNode)
			removableNode.remove()
			liveIndex++
			continue
		}
		if (
			targetNode.nodeType === Node.TEXT_NODE &&
			targetNode.nodeValue?.trim() === '' &&
			liveNode.nodeType !== Node.TEXT_NODE &&
			!(parentNode instanceof Element && parentNode.tagName === 'PRE')
		) {
			parentNode.insertBefore(targetNode, liveNode)
			adoptSubtree(adoptionMap, targetNode)
			targetIndex++
			continue
		}

		if (!canHydrateNode(liveNode, targetNode)) {
			parentNode.replaceChild(targetNode, liveNode)
			adoptSubtree(adoptionMap, targetNode)
			liveIndex++
			targetIndex++
			continue
		}

		adoptionMap.set(targetNode, liveNode)

		if (liveNode.nodeType === Node.TEXT_NODE || liveNode.nodeType === Node.CDATA_SECTION_NODE) {
			if (liveNode.nodeValue !== targetNode.nodeValue) liveNode.nodeValue = targetNode.nodeValue
		} else if (liveNode.nodeType === Node.ELEMENT_NODE) {
			const liveElement = /** @type {Element} */ (liveNode)
			reconcileHydrationNodes(
				liveElement,
				Array.from(liveElement.childNodes),
				Array.from(targetNode.childNodes),
				adoptionMap,
				null,
			)
		}

		liveIndex++
		targetIndex++
	}
}

/**
 * Holds information about a template instance's nodes and interpolation sites.
 */
class TemplateInstance {
	nodes
	sites

	/**
	 * @param {TemplateNodes} nodes The cloned nodes for this template instance
	 * @param {InterpolationSite[]} sites The interpolation sites in the template
	 */
	constructor(nodes, sites) {
		this.nodes = nodes
		this.sites = sites
	}

	/**
	 * Absorb live nodes mapped for adoption into this template instance.
	 *
	 * @param {Map<Node, Node>} adoptionMap
	 */
	absorb(adoptionMap) {
		this.nodes = /** @type {TemplateNodes} */ (
			Object.freeze(this.nodes.map(node => /** @type {Element | Text} */ (adoptionMap.get(node) || node)))
		)
		const nestedAdoptionMaps = new Map()
		const reboundElementStates = new WeakSet()
		for (const site of this.sites) {
			const previousNode = site.node
			const node = /** @type {Element | Text} */ (adoptionMap.get(site.node) || site.node)
			site.node = node
			if (site.insertedNodes)
				site.insertedNodes = site.insertedNodes.map(
					node => /** @type {Element | Text} */ (adoptionMap.get(node) || node),
				)
			const elementState = site.elementState
			if (!elementState || node === previousNode || reboundElementStates.has(elementState)) continue

			for (const [eventName, eventState] of elementState.eventBindings || []) {
				if (eventState.internalHandler) previousNode.removeEventListener(eventName, eventState.internalHandler)
				eventState.internalHandler = undefined
				if (eventState.currentEventListener)
					updateEventHandler(/** @type {Element} */ (node), eventName, eventState, eventState.currentEventListener)
			}

			if (/** @type {Element} */ (node).localName.includes('-'))
				for (const binding of elementState.lastBindings?.values() || [])
					if (binding.type === 'property') /** @type {any} */ (node)[binding.attributeName] = binding.value
			for (const binding of elementState.lastBindings?.values() || []) {
				if (
					binding.type === 'property' &&
					binding.attributeName === '__pepperRef' &&
					binding.value &&
					typeof binding.value === 'object' &&
					'current' in binding.value
				) binding.value.current = /** @type {Element} */ (node)
			}

			reboundElementStates.add(elementState)
		}
		for (const [templateNode, liveNode] of adoptionMap) {
			const templateInstance = nodeTemplateInstances.get(templateNode)
			if (!templateInstance || templateInstance === this) continue
			let nestedAdoptionMap = nestedAdoptionMaps.get(templateInstance)
			if (!nestedAdoptionMap) nestedAdoptionMaps.set(templateInstance, (nestedAdoptionMap = new Map()))
			nestedAdoptionMap.set(templateNode, liveNode)
		}
		for (const [templateInstance, nestedAdoptionMap] of nestedAdoptionMaps) templateInstance.absorb(nestedAdoptionMap)
		trackTemplateInstanceNodes(this, this.getRenderedNodes())
		return this
	}

	/**
	 * Apply values to interpolation sites
	 * @param {InterpolationValue[]} values
	 */
	applyValues(values) {
		const sites = this.sites
		/** @type {Element | null} */
		let currentElement = null
		/** @type {NonNullable<InterpolationSite['elementState']> | null} */
		let currentElementState = null
		/** @type {Map<string, { type: 'attribute'|'boolean-attribute'|'property'|'event', attributeName: string, value: unknown, force?: boolean }> | null} */
		let currentBindings = null

		const flushElementBindings = () => {
			if (!currentElement || !currentElementState || !currentBindings) return

			const element = /** @type {Element} */ (currentElement)
			const anyElement = /** @type {any} */ (element)
			const lastBindings = currentElementState.lastBindings || new Map()
			const eventBindings = currentElementState.eventBindings || new Map()

			for (const [key, binding] of lastBindings) {
				if (currentBindings.has(key)) continue

				if (binding.type === 'event') {
					const eventState = eventBindings.get(binding.attributeName)
					if (eventState) {
						if (eventState.internalHandler)
							element.removeEventListener(binding.attributeName, eventState.internalHandler)
						eventBindings.delete(binding.attributeName)
					}
				} else if (binding.type === 'property') {
					if (binding.attributeName === '__pepperRef') {
						if (binding.value && typeof binding.value === 'object' && 'current' in binding.value)
							binding.value.current = null
					} else {
					anyElement[binding.attributeName] = undefined
					}
				} else element.removeAttribute(binding.attributeName)
			}

			for (const [key, binding] of currentBindings) {
				const previous = lastBindings.get(key)
				if (
					!binding.force &&
					previous &&
					previous.type === binding.type &&
					previous.attributeName === binding.attributeName &&
					previous.value === binding.value
				)
					continue

				if (binding.type === 'event') {
					let eventState = eventBindings.get(binding.attributeName)
					if (!eventState) eventBindings.set(binding.attributeName, (eventState = {}))
					updateEventHandler(element, binding.attributeName, eventState, binding.value)
				} else if (binding.type === 'property') {
					if (binding.attributeName === '__pepperRef') {
						if (previous?.value && previous.value !== binding.value && typeof previous.value === 'object' && 'current' in previous.value)
							previous.value.current = null
						if (binding.value && typeof binding.value === 'object' && 'current' in binding.value) binding.value.current = element
					} else {
						anyElement[binding.attributeName] = binding.value
					}
				} else if (binding.type === 'boolean-attribute') {
					if (binding.value) element.setAttribute(binding.attributeName, '')
					else element.removeAttribute(binding.attributeName)
					} else {
						element.setAttribute(binding.attributeName, /** @type {string} */ (binding.value))
					}
			}

			currentElementState.lastBindings = currentBindings
			currentElementState.eventBindings = eventBindings.size ? eventBindings : undefined
			currentElement = null
			currentElementState = currentBindings = null
		}

		for (const site of sites) {
			if (site.type === 'text') {
				flushElementBindings()
				// With pre-split text nodes, each text site corresponds to exactly one interpolation
				const value = values[/** @type {number} */ (site.interpolationIndex)]
				interpolateTextSite(site, value)
				continue
			}

			const element = /** @type {Element} */ (site.node)
			if (element !== currentElement) {
				flushElementBindings()
				currentElement = element
					currentElementState = site.elementState || {}
				currentBindings = new Map()
			}

			const parts = site.parts || []
			if (site.type === 'spread') {
				const spreadValue = handleForceValue(site, values[/** @type {number} */ (site.interpolationIndex)])
				if (
					spreadValue == null ||
					spreadValue === false ||
					typeof spreadValue !== 'object' ||
					Array.isArray(spreadValue) ||
					spreadValue instanceof Node
				)
					continue

				for (const [name, inputValue] of Object.entries(spreadValue)) {
					/** @type {'attribute'|'boolean-attribute'|'property'|'event'} */
					let type = 'attribute'
					let attributeName = name
					let bindingValue = inputValue

					if (name.startsWith('?')) {
						type = 'boolean-attribute'
						attributeName = name.slice(1)
						bindingValue = !!inputValue
					} else if (name === 'ref') {
						type = 'property'
						attributeName = '__pepperRef'
					} else if (name.startsWith('.')) {
						type = 'property'
						attributeName = name.slice(1)
					} else if (name.startsWith('@')) {
						type = 'event'
						attributeName = name.slice(1)
						if (inputValue == null || inputValue === '' || inputValue === false) {
							if (!currentBindings) continue
							currentBindings.delete(getBindingKey(type, attributeName))
							continue
						}
					} else {
						if (isTrustedTextValue(inputValue)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR)
						if (inputValue instanceof Node || Array.isArray(inputValue) || typeof inputValue === 'function')
							throw new Error(ATTRIBUTE_SITE_ERROR)
						bindingValue = String(inputValue ?? '')
					}

						if (!currentBindings) continue
						currentBindings.set(getBindingKey(type, attributeName), {
						type,
						attributeName,
						value: bindingValue,
						force: site.skipEqualityCheck,
					})
				}
				continue
			}

			if (site.type === 'attribute') {
				const attributeValues = parts
					.filter(part => typeof part === 'number')
					.map(part => {
						const value = values[part]
						if (isForceWrapped(value)) {
							if (!site.requiresUnwrapping) {
								site.skipEqualityCheck = true
								site.requiresUnwrapping = true
							}
							return unwrapForce(value)
						} else if (site.requiresUnwrapping) {
							throw new Error(
								'Value must be wrapped with force() for this interpolation site. Once force() is used at a site, it must always be used.',
							)
						}
						return value
					})

				if (attributeValues.some(isTrustedTextValue)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR)
				if (attributeValues.some(value => value instanceof Node || Array.isArray(value) || typeof value === 'function'))
					throw new Error(ATTRIBUTE_SITE_ERROR)

				const processedValues = [...values]
				let attributeValueIndex = 0
				for (const part of parts)
					if (typeof part === 'number') processedValues[part] = attributeValues[attributeValueIndex++]

					if (!currentBindings) continue
					currentBindings.set(getBindingKey(site.type, site.attributeName || ''), {
					type: site.type,
					attributeName: site.attributeName || '',
					value: joinPartsWithValues(parts, processedValues),
					force: site.skipEqualityCheck,
				})
				continue
			}

			if (site.type === 'boolean-attribute') {
				let setAttribute = false
				if (parts.length === 3 && parts[0] === '' && parts[2] === '' && typeof parts[1] === 'number') {
					const value = handleForceValue(site, values[parts[1]])
					if (isTrustedTextValue(value)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR)
					setAttribute = !!value
				} else if (parts.length === 1 && typeof parts[0] === 'string') setAttribute = parts[0].trim() !== ''
				else setAttribute = true

					if (!currentBindings) continue
					currentBindings.set(getBindingKey(site.type, site.attributeName || ''), {
					type: site.type,
					attributeName: site.attributeName || '',
					value: setAttribute,
					force: site.skipEqualityCheck,
				})
				continue
			}

			if (site.type === 'property') {
				const value = resolveSiteValue(site, values)
				if (isTrustedTextValue(value)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR)
				if (site.attributeName === '__pepperRef' && (!value || typeof value !== 'object' || !('current' in value))) {
					throw new TypeError('Pepper ref bindings expect ref() objects, e.g. ref=${buttonRef}.')
				}
					if (!currentBindings) continue
					currentBindings.set(getBindingKey(site.type, site.attributeName || ''), {
					type: site.type,
					attributeName: site.attributeName || '',
					value,
					force: site.skipEqualityCheck,
				})
				continue
			}

			const eventName = site.attributeName || ''
			let inputValue = resolveSiteValue(site, values)
			if (isTrustedTextValue(inputValue)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR)
			if (typeof inputValue === 'string' && inputValue.trim() === '') inputValue = null

			const bindingKey = getBindingKey(site.type, eventName)
			if (inputValue == null || inputValue === '' || inputValue === false) {
				if (!currentBindings) continue
				currentBindings.delete(bindingKey)
				continue
			}

				if (!currentBindings) continue
				currentBindings.set(bindingKey, {
				type: site.type,
				attributeName: eventName,
				value: inputValue,
				force: site.skipEqualityCheck,
			})
		}

		flushElementBindings()
	}

	getRenderedNodes() {
		return /** @type {TemplateNodes} */ (
			Object.freeze(
				this.nodes.flatMap(node => {
					for (const site of this.sites) {
						if (site.type !== 'text' || site.node !== node || !site.insertedNodes?.length) continue
						return site.insertedNodes
					}
					return [node]
				}),
			)
		)
	}
}

/** @typedef {readonly (Element | Text)[]} TemplateNodes */
/** @typedef {unknown} InterpolationValue */
/** @typedef {symbol | object | function} WeakMapKey */
/** @typedef {WeakMapKey} TemplateKey */
/**
 * @typedef {{
 *   [UNSAFE_HTML_SYMBOL]?: string,
 *   [UNSAFE_SVG_SYMBOL]?: string,
 *   [UNSAFE_MATHML_SYMBOL]?: string,
 *   [RAW_TEXT_SYMBOL]?: string,
 * }} TrustedTextValue
 */
/**
 * Holds information about an interpolation site in the template, f.e. the
 * `${...}` in `<div>${...}</div>` or `<button .onclick=${...}>`.
 *
 * @typedef {{
 *   node: Element | Text,
 *   type: 'text'|'attribute'|'event'|'boolean-attribute'|'property'|'spread',
 *   attributeName?: string,
 *   parts?: Array<string | number>,
 *   interpolationIndex?: number,
 *   insertedNodes?: Node[],
 *   lastValue?: unknown,
 *   elementState?: { lastBindings?: Map<string, { type: 'attribute'|'boolean-attribute'|'property'|'event', attributeName: string, value: unknown, force?: boolean }>, eventBindings?: Map<string, { currentEventListener?: EventListener, internalHandler?: EventListener }> },
 *   skipEqualityCheck?: boolean,
 *   requiresUnwrapping?: boolean
 * }} InterpolationSite
 */

/** @typedef { 'html' | 'svg' | 'mathml'} TemplateMode */
