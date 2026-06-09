// @ts-nocheck

/**
 * @typedef {'html' | 'svg' | 'mathml'} Namespace
 * @typedef {import('typescript').Expression} TsExpression
 * @typedef {import('typescript').TaggedTemplateExpression} TaggedTemplateExpression
 * @typedef {{text: string, start: number}} TemplateSegment
 * @typedef {{start: number, length: number, code: number, ruleId: string, message: string}} StructuralDiagnostic
 * @typedef {{tag: string, namespace: Namespace, start: number, length: number, dynamicComponent?: boolean, expressionIndex?: number}} StackEntry
 * @typedef {{index: number, tagName: string, namespace: Namespace}} BaseHole
 * @typedef {BaseHole & {kind: 'spread', prefix: '...'}} SpreadHole
 * @typedef {BaseHole & {kind: 'component-tag' | 'component-close-tag'}} ComponentHole
 * @typedef {BaseHole & BindingHoleFields} BindingHole
 *
 * @typedef {object} BindingHoleFields
 * @property {'property' | 'boolean-attribute' | 'event' | 'attribute'} kind
 * @property {string} rawName
 * @property {string} name
 * @property {boolean} forced
 *
 * @typedef {BaseHole & {kind: 'text'}} TextHole
 * @typedef {SpreadHole | ComponentHole | BindingHole | TextHole} Hole
 *
 * @typedef {object} ScannerState
 * @property {string} mode
 * @property {string} quote
 * @property {string} currentTag
 * @property {number} currentTagHoleIndex
 * @property {Namespace} currentTagNamespace
 * @property {string} currentAttr
 * @property {number} currentAttrStart
 * @property {Map<string, boolean>} currentTagAttributes
 * @property {boolean} attrRecorded
 * @property {boolean} pendingSpread
 * @property {string} closingTag
 * @property {number} closingTagHoleIndex
 * @property {string} closingTagAttr
 * @property {number} closingTagAttrStart
 * @property {boolean} closingTagAttrReported
 * @property {string} closingTagAttrQuote
 * @property {number} tagStart
 * @property {boolean} selfClosing
 * @property {string} rawTextTag
 *
 * @typedef {{holes: Hole[], state: ScannerState, stack: StackEntry[], diagnostics: StructuralDiagnostic[]}} ScanResult
 *
 * @typedef {object} TemplateEntry
 * @property {TaggedTemplateExpression} node
 * @property {Namespace} mode
 * @property {TemplateSegment[]} segments
 * @property {Hole[]} holes
 * @property {ScannerState} state
 * @property {StackEntry[]} stack
 * @property {StructuralDiagnostic[]} diagnostics
 * @property {TsExpression[]} expressions
 */

function resolveNamespace(parentNamespace, tagName) {
	if (parentNamespace === 'html' && tagName.toLowerCase() === 'svg') return 'svg'
	if (parentNamespace === 'html' && tagName.toLowerCase() === 'math') return 'mathml'
	if (parentNamespace === 'svg' && tagName === 'foreignObject') return 'html'
	return parentNamespace
}

/**
 * Create helpers that discover Pepper tagged templates and scan template text.
 * @param {object} context
 */
function createDiscoveryAndScan(context) {
	const {ts, sourceFile, caches, constants} = context
	const {DIAGNOSTIC_CODES, STRUCTURAL_RULES} = constants
	const {
		VOID_HTML_TAGS,
		RAW_TEXT_TAGS,
		COMPONENT_TAG_PLACEHOLDER,
		PHRASING_ONLY_TAGS,
		KNOWN_HTML_TAGS,
		NON_PHRASING_CHILD_TAGS,
		CHILD_TAG_ALLOWLISTS,
		OPTIONAL_END_TAG_OPEN_RULES,
		PEPPER_TAG_MODES,
	} = constants
	const {getResolvedSymbol, isPepperDeclaration} = context.types

	function getPepperTagMode(taggedTemplate) {
		const tagNode =
			ts.isPropertyAccessExpression(taggedTemplate.tag) || ts.isIdentifier(taggedTemplate.tag)
				? taggedTemplate.tag
				: null
		const tagName = tagNode && (ts.isIdentifier(tagNode) ? tagNode.text : tagNode.name.text)
		if (!tagName || !PEPPER_TAG_MODES.has(tagName)) return null
		const symbol = getResolvedSymbol(ts.isIdentifier(tagNode) ? tagNode : tagNode.name)
		if (!symbol) return null
		for (const declaration of symbol.declarations || []) if (isPepperDeclaration(declaration)) return tagName
		return null
	}

	function readTemplateSegments(taggedTemplate) {
		if (ts.isNoSubstitutionTemplateLiteral(taggedTemplate.template)) {
			const text = taggedTemplate.template.getText(sourceFile)
			return [{text: text.slice(1, -1), start: taggedTemplate.template.getStart(sourceFile) + 1}]
		}
		const segments = []
		const {head, templateSpans} = taggedTemplate.template
		const headText = head.getText(sourceFile)
		segments.push({text: headText.slice(1, -2), start: head.getStart(sourceFile) + 1})
		for (const span of templateSpans) {
			const literalText = span.literal.getText(sourceFile)
			const trimEnd = span.literal.kind === ts.SyntaxKind.TemplateTail ? 1 : 2
			segments.push({text: literalText.slice(1, -trimEnd), start: span.literal.getStart(sourceFile) + 1})
		}
		return segments
	}

	function scanTemplate(segments, mode, expressionTexts = []) {
		const stack = []
		const state = {
			mode: 'text',
			quote: '',
			currentTag: '',
			currentTagHoleIndex: -1,
			currentTagNamespace: mode,
			currentAttr: '',
			currentAttrStart: -1,
			currentTagAttributes: new Map(),
			attrRecorded: false,
			pendingSpread: false,
			closingTag: '',
			closingTagHoleIndex: -1,
			closingTagAttr: '',
			closingTagAttrStart: -1,
			closingTagAttrReported: false,
			closingTagAttrQuote: '',
			tagStart: -1,
			selfClosing: false,
			rawTextTag: '',
		}
		const holes = []
		const diagnostics = []

		function pushStructuralDiagnostic(start, length, code, ruleId, message) {
			diagnostics.push({start, length, code, ruleId, message})
		}

		function pushRule(start, length, key, message) {
			pushStructuralDiagnostic(start, length, DIAGNOSTIC_CODES[key], STRUCTURAL_RULES[key], message)
		}

		function recordCurrentAttribute() {
			if (!state.currentAttr || state.attrRecorded) return
			const unforced = state.currentAttr.startsWith('!') ? state.currentAttr.slice(1) : state.currentAttr
			const key =
				unforced.startsWith('.') || unforced.startsWith('@') ? state.currentAttr : state.currentAttr.toLowerCase()
			if (state.currentTagAttributes.has(key))
				pushRule(
					state.currentAttrStart,
					state.currentAttr.length,
					'duplicateAttribute',
					`Attribute "${state.currentAttr}" duplicated`,
				)
			else state.currentTagAttributes.set(key, true)
			state.attrRecorded = true
		}

		function reportClosingTagAttribute() {
			if (state.closingTagAttrReported || !state.closingTagAttr) return
			pushRule(
				state.closingTagAttrStart,
				state.closingTagAttr.length,
				'closeTagAttribute',
				'Close tags cannot have attributes',
			)
			state.closingTagAttrReported = true
		}

		function closeCurrentTag() {
			if (!stack.length) return
			stack.pop()
			state.mode = 'text'
			state.rawTextTag = ''
		}

		function finalizeTag(tagEnd) {
			if (!state.currentTag) {
				state.mode = 'text'
				state.selfClosing = false
				state.currentTagHoleIndex = -1
				state.tagStart = -1
				return
			}
			const tagStart = state.tagStart
			const lowerTagName = state.currentTag.toLowerCase()
			const currentNamespace = stack.length ? stack[stack.length - 1].namespace : mode
			state.currentTagNamespace = resolveNamespace(currentNamespace, state.currentTag)
			const parent = stack[stack.length - 1]
			const parentTag = parent?.tag.toLowerCase() || ''
			if (state.currentTagNamespace === 'html') {
				if (
					state.currentTag !== COMPONENT_TAG_PLACEHOLDER &&
					!KNOWN_HTML_TAGS.has(lowerTagName) &&
					!lowerTagName.includes('-')
				)
					pushRule(tagStart, tagEnd - tagStart + 1, 'invalidElementName', `<${state.currentTag}> is not a valid element name`)
				const impliedCloseChildren = OPTIONAL_END_TAG_OPEN_RULES.get(parentTag)
				if (impliedCloseChildren?.has(lowerTagName))
					pushRule(
						tagStart,
						tagEnd - tagStart + 1,
						'implicitOptionalEndTag',
						`Opening <${state.currentTag}> relies on an implicit closing tag for <${parent.tag}>.`,
					)
				if (
					parent &&
					parent.namespace === 'html' &&
					PHRASING_ONLY_TAGS.has(parentTag) &&
					NON_PHRASING_CHILD_TAGS.has(lowerTagName)
				)
					pushRule(
						tagStart,
						tagEnd - tagStart + 1,
						'invalidNesting',
						`<${state.currentTag}> is not allowed inside <${parent.tag}>; browser parsing will change the DOM tree.`,
					)
				if (lowerTagName === 'a' && stack.some(entry => entry.namespace === 'html' && entry.tag.toLowerCase() === 'a'))
					pushRule(
						tagStart,
						tagEnd - tagStart + 1,
						'invalidNesting',
						'Nested <a> elements are not allowed; browser parsing will change the DOM tree.',
					)
				if (lowerTagName === 'tr' && parentTag === 'table')
					pushRule(
						tagStart,
						tagEnd - tagStart + 1,
						'implicitTbody',
						'<tr> cannot appear directly under <table>; write an explicit <tbody>.',
					)
				if ((lowerTagName === 'td' || lowerTagName === 'th') && parentTag !== 'tr')
					pushRule(
						tagStart,
						tagEnd - tagStart + 1,
						'invalidTableStructure',
						`<${state.currentTag}> must appear inside <tr>.`,
					)
				if (lowerTagName === 'tr' && parentTag && !['table', 'thead', 'tbody', 'tfoot'].includes(parentTag))
					pushRule(
						tagStart,
						tagEnd - tagStart + 1,
						'invalidTableStructure',
						'<tr> must appear inside <thead>, <tbody>, or <tfoot>.',
					)
				if (parent?.namespace === 'html' && CHILD_TAG_ALLOWLISTS.has(parentTag)) {
					const allowed = CHILD_TAG_ALLOWLISTS.get(parentTag)
					const coveredByTableRule =
						(lowerTagName === 'tr' && parentTag === 'table') ||
						((lowerTagName === 'td' || lowerTagName === 'th') && parentTag !== 'tr')
					if (!allowed.has(lowerTagName) && !coveredByTableRule)
						pushRule(
							tagStart,
							tagEnd - tagStart + 1,
							parentTag === 'table' || parentTag === 'tr' ? 'invalidTableStructure' : 'invalidNesting',
							`<${state.currentTag}> element is not permitted as content under <${parent.tag}>; browser parsing will change the DOM tree.`,
						)
				}
				if (lowerTagName === 'title' && parentTag && parentTag !== 'head')
					pushRule(
						tagStart,
						tagEnd - tagStart + 1,
						'invalidElementParent',
						'<title> element requires a <head> element as parent',
					)
			}
			if (!state.selfClosing && !(state.currentTagNamespace === 'html' && VOID_HTML_TAGS.has(lowerTagName)))
				stack.push({
					dynamicComponent: state.currentTag === COMPONENT_TAG_PLACEHOLDER,
					expressionIndex: state.currentTagHoleIndex,
					tag: state.currentTag,
					namespace: state.currentTagNamespace,
					start: tagStart,
					length: tagEnd - tagStart + 1,
				})
			state.mode = RAW_TEXT_TAGS.has(lowerTagName) && !state.selfClosing ? 'rawText' : 'text'
			state.rawTextTag = state.mode === 'rawText' ? lowerTagName : ''
			state.quote = ''
			state.currentAttr = ''
			state.currentAttrStart = -1
			state.currentTagAttributes.clear()
			state.attrRecorded = false
			state.currentTag = ''
			state.currentTagHoleIndex = -1
			state.tagStart = -1
			state.selfClosing = false
			state.pendingSpread = false
		}

		function finalizeClosingTag() {
			const tagStart = state.tagStart
			const lowered = state.closingTag.toLowerCase()
			if (state.closingTag === COMPONENT_TAG_PLACEHOLDER) {
				const closingExpression = expressionTexts[state.closingTagHoleIndex] || 'component'
				const current = stack[stack.length - 1]
				if (!current)
					pushRule(
						tagStart,
						closingExpression.length + 5,
						'mismatchedClosingTag',
						`Closing </\${${closingExpression}}> does not match any open component tag.`,
					)
				else if (current.dynamicComponent && expressionTexts[current.expressionIndex] === closingExpression) closeCurrentTag()
				else {
					const currentLabel =
						current.dynamicComponent && current.expressionIndex >= 0
							? `\${${expressionTexts[current.expressionIndex] || 'component'}}`
							: current.tag
					pushRule(
						tagStart,
						closingExpression.length + 5,
						'mismatchedClosingTag',
						`Closing </\${${closingExpression}}> does not match currently open <${currentLabel}>.`,
					)
					const matchIndex = stack.findLastIndex(
						entry => entry.dynamicComponent && expressionTexts[entry.expressionIndex] === closingExpression,
					)
					if (matchIndex >= 0) {
						stack.length = matchIndex + 1
						closeCurrentTag()
					}
				}
			} else {
				if (VOID_HTML_TAGS.has(lowered)) {
					pushRule(tagStart, state.closingTag.length + 3, 'voidContent', `End tag for <${state.closingTag}> must be omitted`)
					state.mode = 'text'
					state.closingTag = ''
					state.closingTagHoleIndex = -1
					state.rawTextTag = ''
					return
				}
				const current = stack[stack.length - 1]
				if (!current)
					pushRule(
						tagStart,
						state.closingTag.length + 3,
						'mismatchedClosingTag',
						`Closing </${state.closingTag}> does not match any open tag.`,
					)
				else if (current.tag.toLowerCase() === lowered) closeCurrentTag()
				else {
					pushRule(
						tagStart,
						state.closingTag.length + 3,
						'mismatchedClosingTag',
						`Closing </${state.closingTag}> does not match currently open <${current.tag}>.`,
					)
					const matchIndex = stack.findLastIndex(entry => entry.tag.toLowerCase() === lowered)
					if (matchIndex >= 0) {
						stack.length = matchIndex + 1
						closeCurrentTag()
					}
				}
			}
			state.mode = 'text'
			state.closingTag = ''
			state.closingTagHoleIndex = -1
			state.closingTagAttr = ''
			state.closingTagAttrStart = -1
			state.closingTagAttrReported = false
			state.closingTagAttrQuote = ''
			state.tagStart = -1
			state.rawTextTag = ''
		}

		for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
			const {text: segment, start: segmentStart} = segments[segmentIndex]
			for (let index = 0; index < segment.length; index++) {
				const char = segment[index]
				if (state.mode === 'comment') {
					if (segment.startsWith('-->', index)) {
						state.mode = 'text'
						index += 2
					}
					continue
				}
				if (state.mode === 'cdata') {
					if (segment.startsWith(']]>', index)) {
						state.mode = 'text'
						index += 2
					}
					continue
				}
				if (state.mode === 'rawText') {
					const closeTag = `</${state.rawTextTag}`
					const closeTagBoundary = segment[index + closeTag.length]
					if (
						char === '<' &&
						segment.slice(index, index + closeTag.length).toLowerCase() === closeTag &&
						(closeTagBoundary === '>' || /\s/.test(closeTagBoundary || ''))
					) {
						state.tagStart = segmentStart + index
						state.mode = 'closingTag'
						state.closingTag = ''
						index++
					}
					continue
				}
				if (state.mode === 'text') {
					if (segment.startsWith('<!--', index)) {
						state.mode = 'comment'
						index += 3
					} else if (segment.startsWith('<![CDATA[', index)) {
						state.mode = 'cdata'
						index += 8
					} else if (char === '<') {
						state.quote = ''
						state.currentAttr = ''
						state.currentAttrStart = -1
						state.currentTagAttributes.clear()
						state.attrRecorded = false
						state.currentTag = ''
						state.currentTagHoleIndex = -1
						state.pendingSpread = false
						state.selfClosing = false
						state.tagStart = segmentStart + index
						if (segment[index + 1] === '/') {
							state.mode = 'closingTag'
							state.closingTag = ''
							state.closingTagHoleIndex = -1
							state.closingTagAttr = ''
							state.closingTagAttrStart = -1
							state.closingTagAttrReported = false
							state.closingTagAttrQuote = ''
							index++
						} else state.mode = 'tagName'
					}
					continue
				}
				if (state.mode === 'closingTag') {
					if (char === '>') finalizeClosingTag()
					else if (/\s/.test(char)) {
						if (state.closingTag) state.mode = 'afterClosingTagName'
					} else state.closingTag += char
					continue
				}
				if (state.mode === 'afterClosingTagName') {
					if (char === '>') finalizeClosingTag()
					else if (!/\s/.test(char)) {
						state.closingTagAttr = char
						state.closingTagAttrStart = segmentStart + index
						state.closingTagAttrReported = false
						state.mode = 'closingTagAttribute'
					}
					continue
				}
				if (state.mode === 'closingTagAttribute') {
					if (char === '>') {
						reportClosingTagAttribute()
						finalizeClosingTag()
					} else if (char === '=') {
						reportClosingTagAttribute()
						state.closingTagAttrQuote = ''
						state.mode = 'closingTagAttributeValue'
					} else if (/\s/.test(char)) {
						reportClosingTagAttribute()
						state.mode = 'afterClosingTagName'
					} else state.closingTagAttr += char
					continue
				}
				if (state.mode === 'closingTagAttributeValue') {
					if (state.closingTagAttrQuote) {
						if (char === state.closingTagAttrQuote) state.closingTagAttrQuote = ''
					} else if (char === '"' || char === "'") state.closingTagAttrQuote = char
					else if (char === '>') finalizeClosingTag()
					else if (/\s/.test(char)) state.mode = 'afterClosingTagName'
					continue
				}
				if (state.mode === 'tagName') {
					if (char === '>') finalizeTag(segmentStart + index)
					else if (char === '/') state.selfClosing = true
					else if (/\s/.test(char)) {
						const currentNamespace = stack.length ? stack[stack.length - 1].namespace : mode
						state.currentTagNamespace = resolveNamespace(currentNamespace, state.currentTag)
						state.mode = 'beforeAttr'
					} else state.currentTag += char
					continue
				}
				if (state.mode === 'beforeAttr') {
					if (char === '>') finalizeTag(segmentStart + index)
					else if (char === '/') state.selfClosing = true
					else if (/\s/.test(char)) state.pendingSpread = false
					else if (segment.slice(index, index + 3) === '...') {
						state.pendingSpread = true
						index += 2
					} else {
						state.pendingSpread = false
						state.currentAttr = char
						state.currentAttrStart = segmentStart + index
						state.attrRecorded = false
						state.mode = 'attrName'
					}
					continue
				}
				if (state.mode === 'attrName') {
					if (char === '=') {
						recordCurrentAttribute()
						state.mode = 'beforeAttrValue'
					} else if (char === '>') {
						recordCurrentAttribute()
						finalizeTag(segmentStart + index)
					} else if (char === '/') {
						recordCurrentAttribute()
						state.selfClosing = true
						state.mode = 'beforeAttr'
					} else if (/\s/.test(char)) {
						recordCurrentAttribute()
						state.mode = 'afterAttrName'
					} else state.currentAttr += char
					continue
				}
				if (state.mode === 'afterAttrName') {
					if (char === '=') state.mode = 'beforeAttrValue'
					else if (char === '>') finalizeTag(segmentStart + index)
					else if (char === '/') {
						state.selfClosing = true
						state.mode = 'beforeAttr'
					} else if (!/\s/.test(char)) {
						state.currentAttr = char
						state.currentAttrStart = segmentStart + index
						state.attrRecorded = false
						state.mode = 'attrName'
					}
					continue
				}
				if (state.mode === 'beforeAttrValue') {
					if (/\s/.test(char)) continue
					if (char === '"' || char === "'") {
						state.quote = char
						state.mode = 'attrValue'
					} else if (char === '>') finalizeTag(segmentStart + index)
					else {
						state.quote = ''
						state.mode = 'attrValue'
					}
					continue
				}
				if (state.mode === 'attrValue') {
					if (state.quote) {
						if (char === state.quote) {
							state.quote = ''
							state.currentAttr = ''
							state.mode = 'beforeAttr'
						}
					} else if (char === '>') finalizeTag(segmentStart + index)
					else if (/\s/.test(char)) {
						state.currentAttr = ''
						state.mode = 'beforeAttr'
					}
				}
			}

			if (segmentIndex === segments.length - 1) continue
			if (state.pendingSpread && state.mode === 'beforeAttr') {
				holes.push({
					index: segmentIndex,
					kind: 'spread',
					tagName: state.currentTag,
					namespace: state.currentTagNamespace,
					prefix: '...',
				})
				state.pendingSpread = false
				continue
			}
			if (state.mode === 'tagName' && !state.currentTag) {
				holes.push({
					index: segmentIndex,
					kind: 'component-tag',
					tagName: COMPONENT_TAG_PLACEHOLDER,
					namespace: stack.length ? stack[stack.length - 1].namespace : mode,
				})
				state.currentTag = COMPONENT_TAG_PLACEHOLDER
				state.currentTagHoleIndex = segmentIndex
				state.currentTagNamespace = stack.length ? stack[stack.length - 1].namespace : mode
				continue
			}
			if (state.mode === 'closingTag' && !state.closingTag) {
				holes.push({
					index: segmentIndex,
					kind: 'component-close-tag',
					tagName: COMPONENT_TAG_PLACEHOLDER,
					namespace: stack.length ? stack[stack.length - 1].namespace : mode,
				})
				state.closingTag = COMPONENT_TAG_PLACEHOLDER
				state.closingTagHoleIndex = segmentIndex
				continue
			}
			if (state.mode === 'beforeAttrValue' || state.mode === 'attrValue') {
				const rawName = state.currentAttr
				holes.push({
					index: segmentIndex,
					kind: rawName.startsWith('.')
						? 'property'
						: rawName.startsWith('?')
							? 'boolean-attribute'
							: rawName.startsWith('@')
								? 'event'
								: 'attribute',
					tagName: state.currentTag,
					namespace: state.currentTagNamespace,
					rawName,
					name: rawName.replace(/^!?(?:[.?@])?/, ''),
					forced: rawName.startsWith('!'),
				})
				if (state.mode === 'beforeAttrValue') {
					state.currentAttr = ''
					state.mode = 'beforeAttr'
					state.quote = ''
				}
				continue
			}
			holes.push({
				index: segmentIndex,
				kind: 'text',
				tagName: stack.length ? stack[stack.length - 1].tag : '',
				namespace: stack.length ? stack[stack.length - 1].namespace : mode,
			})
		}

		for (const entry of stack)
			pushRule(
				entry.start,
				entry.length,
				'missingClosingTag',
				entry.dynamicComponent
					? `Missing closing tag for <\${${expressionTexts[entry.expressionIndex] || 'component'}}>.`
					: `Missing closing tag for <${entry.tag}>.`,
			)
		return {holes, state, stack, diagnostics}
	}

	function getTemplateEntry(taggedTemplate) {
		if (caches.templateEntries.has(taggedTemplate)) return caches.templateEntries.get(taggedTemplate)
		const mode = getPepperTagMode(taggedTemplate)
		if (!mode) {
			caches.templateEntries.set(taggedTemplate, null)
			return null
		}
		const segments = readTemplateSegments(taggedTemplate)
		const expressions = ts.isNoSubstitutionTemplateLiteral(taggedTemplate.template)
			? []
			: taggedTemplate.template.templateSpans.map(span => span.expression)
		const parsed = scanTemplate(
			segments,
			mode,
			expressions.map(expression => expression.getText(sourceFile)),
		)
		const entry = {node: taggedTemplate, mode, segments, ...parsed, expressions}
		caches.templateEntries.set(taggedTemplate, entry)
		return entry
	}

	function getTemplateEntries() {
		if (context.cachedTemplateEntries) return context.cachedTemplateEntries
		const entries = []
		const visit = node => {
			if (ts.isTaggedTemplateExpression(node)) {
				const entry = getTemplateEntry(node)
				if (entry) entries.push(entry)
			}
			ts.forEachChild(node, visit)
		}
		visit(sourceFile)
		context.cachedTemplateEntries = entries
		return entries
	}

	function getContainingTemplateEntry(position) {
		if (!context.cachedTemplateRanges) {
			context.cachedTemplateRanges = getTemplateEntries()
				.map(entry => ({
					entry,
					start: entry.node.getStart(sourceFile),
					end: entry.node.getEnd(),
				}))
				.sort((left, right) => left.start - right.start || right.end - left.end)
		}
		let best = null
		for (const range of context.cachedTemplateRanges) {
			if (range.start > position) break
			if (position <= range.end && (!best || (range.start >= best.start && range.end <= best.end))) best = range
		}
		return best?.entry || null
	}

	return {getTemplateEntries, getContainingTemplateEntry, scanTemplate}
}

module.exports = {createDiscoveryAndScan}
