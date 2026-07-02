// @ts-nocheck

/**
 * @typedef {'html' | 'svg' | 'mathml'} Namespace
 * @typedef {import('typescript').Node} TsNode
 * @typedef {import('typescript').Expression} TsExpression
 * @typedef {import('typescript').Type} TsType
 * @typedef {{node: TsNode, code: number, message: string}} PendingDiagnostic
 * @typedef {{start: number, length: number, code: number, message: string, ruleId: string}} StructuralDiagnostic
 * @typedef {{properties: string[], attributes: string[], booleans: string[], events: string[]}} CompletionSet
 * @typedef {{name: string, insertText: string, kind: string, sortText: string}} CompletionEntry
 * @typedef {{entries: CompletionEntry[], replacementSpan: {start: number, length: number}}} CompletionResult
 */

/**
 * Create diagnostic and completion APIs from the shared analyzer context.
 * @param {object} context
 */
function createDiagnostics(context) {
	const {ts, checker, sourceFile, caches, constants} = context
	const {DIAGNOSTIC_CODES, DEFAULT_ATTRIBUTE_COMPLETIONS, DEFAULT_BOOLEAN_COMPLETIONS, DEFAULT_EVENT_COMPLETIONS} =
		constants
	const {getGlobalType, resolveElementType, unwrapForceExpression, resolveSpreadEntries} = context.types
	const {getTemplateEntries, getContainingTemplateEntry, scanTemplate} = context.discovery

	function getBindingExpectation(hole) {
		if (hole.kind === 'component-tag') return {kind: 'component-tag', label: 'function component'}
		if (hole.kind === 'component-close-tag') return {kind: 'component-close-tag', label: 'function component'}
		if (hole.kind === 'text') return {kind: 'text', label: 'child value'}
		if (hole.kind === 'spread') return {kind: 'spread', label: 'object, false, null, or undefined'}
		if (!hole.tagName) return {kind: 'unknown', label: 'unknown'}
		const elementType = resolveElementType(hole.namespace, hole.tagName)
		if (!elementType) {
			if (hole.kind === 'event') return {kind: 'event', label: hole.name}
			if (hole.kind === 'boolean-attribute') return {kind: 'boolean', label: 'boolean'}
			return {kind: 'unknown', label: 'unknown'}
		}
		if (hole.kind === 'property') {
			const property = checker.getPropertyOfType(elementType, hole.name)
			if (!property)
				return hole.tagName.includes('-') ? {kind: 'unknown', label: 'unknown'} : {kind: 'property', label: hole.name}
			return {kind: 'property', label: hole.name, type: checker.getTypeOfSymbolAtLocation(property, sourceFile)}
		}
		if (hole.kind === 'event') {
			const eventMap = getGlobalType('GlobalEventHandlersEventMap')
			const eventProperty =
				eventMap &&
				(checker.getPropertyOfType(eventMap, hole.name) ||
					checker.getPropertyOfType(eventMap, hole.name.toLowerCase()) ||
					checker.getPropertyOfType(eventMap, hole.name.toUpperCase()))
			return {
				kind: 'event',
				label: hole.name,
				eventType: eventProperty ? checker.getTypeOfSymbolAtLocation(eventProperty, sourceFile) : null,
			}
		}
		if (hole.kind === 'boolean-attribute') {
			const property =
				checker.getPropertyOfType(elementType, hole.name) ||
				checker.getPropertyOfType(elementType, hole.name.toLowerCase())
			if (!property) return {kind: 'boolean', label: 'boolean'}
			return {kind: 'boolean', label: hole.name, type: checker.getTypeOfSymbolAtLocation(property, sourceFile)}
		}
		const exactProperty = checker.getPropertyOfType(elementType, hole.name)
		if (exactProperty)
			return {
				kind: 'attribute',
				label: hole.name,
				type: checker.getTypeOfSymbolAtLocation(exactProperty, sourceFile),
			}
		const loweredName = hole.name.toLowerCase()
		for (const property of checker.getPropertiesOfType(elementType)) {
			if (String(property.escapedName).toLowerCase() === loweredName)
				return {
					kind: 'attribute',
					label: hole.name,
					type: checker.getTypeOfSymbolAtLocation(property, sourceFile),
				}
		}
		return {kind: 'attribute-primitive', label: hole.name}
	}

	function checkSimpleKind(actualType, expectation) {
		const typeString = checker.typeToString(actualType)
		if (actualType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return null
		if (expectation.kind === 'attribute-primitive') {
			if (actualType.isUnion()) {
				for (const unionPart of actualType.types) {
					const unionResult = checkSimpleKind(unionPart, expectation)
					if (unionResult) return unionResult
				}
				return null
			}
			const allowedFlags =
				ts.TypeFlags.StringLike |
				ts.TypeFlags.NumberLike |
				ts.TypeFlags.BooleanLike |
				ts.TypeFlags.BigIntLike |
				ts.TypeFlags.Null |
				ts.TypeFlags.Undefined
			return actualType.flags & allowedFlags ? null : `primitive attribute value, got ${typeString}`
		}
		if (expectation.kind === 'boolean') {
			const expectedType = expectation.type || checker.getBooleanType()
			return checker.isTypeAssignableTo(actualType, expectedType) ? null : `boolean, got ${typeString}`
		}
		if (expectation.kind === 'property' || expectation.kind === 'attribute') {
			if (!expectation.type || expectation.type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return null
			return checker.isTypeAssignableTo(actualType, expectation.type)
				? null
				: `${checker.typeToString(expectation.type)}, got ${typeString}`
		}
		return null
	}

	function isSpreadValueAllowed(actualType) {
		if (actualType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return true
		if (actualType.isUnion()) return actualType.types.every(isSpreadValueAllowed)
		if (actualType.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) return true
		if (actualType.flags & ts.TypeFlags.BooleanLiteral) return actualType.intrinsicName === 'false'
		if (!(actualType.flags & ts.TypeFlags.Object)) return false
		if (checker.isArrayType(actualType) || checker.isTupleType(actualType)) return false
		const symbol = actualType.getSymbol()
		return !symbol || String(symbol.getName()) !== 'Node'
	}

	function analyzeEventExpression(expression, expectation) {
		const actualType = checker.getTypeAtLocation(expression)
		if (actualType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return []
		if (
			ts.isArrowFunction(expression) ||
			ts.isFunctionExpression(expression) ||
			ts.isMethodDeclaration(expression) ||
			ts.isFunctionDeclaration(expression)
		) {
			if (!expectation.eventType || !expression.parameters.length) return []
			const [firstParam] = expression.parameters
			if (!firstParam.type) return []
			const parameterType = checker.getTypeAtLocation(firstParam)
			return checker.isTypeAssignableTo(expectation.eventType, parameterType)
				? []
				: [
						{
							node: firstParam,
							code: DIAGNOSTIC_CODES.eventParameter,
							message: `pepper @${expectation.label} handler should accept ${checker.typeToString(expectation.eventType)}.`,
						},
					]
		}
		if (actualType.getCallSignatures().length) return []
		if (actualType.isUnion()) {
			for (const unionPart of actualType.types) {
				if (unionPart.getCallSignatures().length) continue
				const flags = unionPart.flags
				if (
					flags &
					(ts.TypeFlags.StringLike | ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Null | ts.TypeFlags.Undefined)
				)
					continue
				return [
					{
						node: expression,
						code: DIAGNOSTIC_CODES.eventValue,
						message: `pepper @${expectation.label} expects a function, string, false, null, or undefined.`,
					},
				]
			}
			return []
		}
		const flags = actualType.flags
		return flags & ts.TypeFlags.StringLike ||
			(flags & ts.TypeFlags.BooleanLiteral && actualType.intrinsicName === 'false') ||
			flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)
			? []
			: [
					{
						node: expression,
						code: DIAGNOSTIC_CODES.eventValue,
						message: `pepper @${expectation.label} expects a function, string, false, null, or undefined.`,
					},
				]
	}

	function buildDiagnostics() {
		if (context.cachedDiagnostics) return context.cachedDiagnostics
		const diagnostics = []

		function pushDiagnostic(node, code, message) {
			diagnostics.push({
				file: sourceFile,
				start: node.getStart(sourceFile),
				length: node.getWidth(sourceFile),
				category: ts.DiagnosticCategory.Error,
				code,
				messageText: message,
			})
		}

		function pushStructuralDiagnostic(diagnostic) {
			diagnostics.push({
				file: sourceFile,
				start: diagnostic.start,
				length: diagnostic.length,
				category: ts.DiagnosticCategory.Error,
				code: diagnostic.code,
				messageText: `${diagnostic.message} (${diagnostic.ruleId})`,
				ruleId: diagnostic.ruleId,
			})
		}

		function analyzeBindingExpression(hole, expression, codePrefix) {
			const {unwrapped} = unwrapForceExpression(expression)
			const expectation = getBindingExpectation(hole)
			if (hole.kind === 'component-tag') {
				const actualType = checker.getTypeAtLocation(unwrapped)
				if (
					!(actualType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) &&
					!actualType.getCallSignatures().length
				)
					pushDiagnostic(unwrapped, DIAGNOSTIC_CODES.componentTagValue, 'pepper component tag expects a function component.')
				return
			}
			if (hole.kind === 'component-close-tag') return
			if (hole.kind === 'event') {
				for (const eventDiagnostic of analyzeEventExpression(unwrapped, expectation))
					pushDiagnostic(eventDiagnostic.node, eventDiagnostic.code, eventDiagnostic.message)
				return
			}
			if (hole.kind === 'text' || expectation.kind === 'unknown' || expectation.kind === 'text') return
			const actualType = checker.getTypeAtLocation(unwrapped)
			const mismatch = checkSimpleKind(actualType, expectation)
			if (!mismatch) return
			const diagnosticCode =
				codePrefix === 'spread'
					? DIAGNOSTIC_CODES.spreadEntryValue
					: hole.kind === 'boolean-attribute'
						? DIAGNOSTIC_CODES.booleanAttributeValue
						: hole.kind === 'property'
							? DIAGNOSTIC_CODES.propertyValue
							: DIAGNOSTIC_CODES.attributeValue
			const labelPrefix =
				hole.kind === 'property'
					? `.${hole.name}`
					: hole.kind === 'boolean-attribute'
						? `?${hole.name}`
						: hole.kind === 'attribute'
							? hole.name
							: hole.kind
			pushDiagnostic(
				unwrapped,
				diagnosticCode,
				`pepper ${codePrefix === 'spread' ? 'spread entry ' : ''}${labelPrefix} on <${hole.tagName}> expects ${mismatch}.`,
			)
		}

		for (const {diagnostics: templateDiagnostics, holes, expressions} of getTemplateEntries()) {
			for (const diagnostic of templateDiagnostics) pushStructuralDiagnostic(diagnostic)
			for (let index = 0; index < holes.length; index++) {
				const hole = holes[index]
				const expression = expressions[index]
				if (!expression) continue
				if (hole.kind === 'spread') {
					const {unwrapped} = unwrapForceExpression(expression)
					const actualType = checker.getTypeAtLocation(unwrapped)
					if (!isSpreadValueAllowed(actualType))
						pushDiagnostic(
							unwrapped,
							DIAGNOSTIC_CODES.spreadValue,
							`pepper spread on <${hole.tagName}> expects an object, false, null, or undefined.`,
						)
					const entries = resolveSpreadEntries(unwrapped)
					if (!entries) continue
					for (const entry of entries) {
						const entryHole = entry.name.startsWith('.')
							? {...hole, kind: 'property', name: entry.name.slice(1)}
							: entry.name.startsWith('?')
								? {...hole, kind: 'boolean-attribute', name: entry.name.slice(1)}
								: entry.name.startsWith('@')
									? {...hole, kind: 'event', name: entry.name.slice(1)}
									: {...hole, kind: 'attribute', name: entry.name}
						analyzeBindingExpression(entryHole, entry.expression, 'spread')
					}
					continue
				}
				analyzeBindingExpression(hole, expression, 'direct')
			}
		}

		context.cachedDiagnostics = diagnostics
		return diagnostics
	}

	function getTemplateCompletions(position) {
		let completion = null

		function getCompletionSet(namespace, tagName) {
			const cacheKey = `${namespace}:${tagName}`
			let completionSet = caches.completionSets.get(cacheKey)
			if (!completionSet) {
				const elementType = resolveElementType(namespace, tagName)
				const propertyEntries = new Set()
				const attributeEntries = new Set(DEFAULT_ATTRIBUTE_COMPLETIONS)
				const booleanEntries = new Set(DEFAULT_BOOLEAN_COMPLETIONS)
				const eventEntries = new Set(DEFAULT_EVENT_COMPLETIONS)
				if (elementType) {
					for (const property of checker.getPropertiesOfType(elementType)) {
						const name = String(property.escapedName)
						const propertyType = checker.getTypeOfSymbolAtLocation(property, sourceFile)
						if (propertyType.getCallSignatures().length) continue
						propertyEntries.add(name)
						attributeEntries.add(name.toLowerCase())
						if (propertyType.flags & ts.TypeFlags.BooleanLike) booleanEntries.add(name.toLowerCase())
					}
				}
				const eventMap = getGlobalType('GlobalEventHandlersEventMap')
				if (eventMap)
					for (const property of checker.getPropertiesOfType(eventMap)) eventEntries.add(String(property.escapedName))
				completionSet = {
					properties: [...propertyEntries].sort(),
					attributes: [...attributeEntries].sort(),
					booleans: [...booleanEntries].sort(),
					events: [...eventEntries].sort(),
				}
				caches.completionSets.set(cacheKey, completionSet)
			}
			return completionSet
		}

		function buildEntries(namespace, tagName, partial, forcePrefix, quoted) {
			const completionSet = getCompletionSet(namespace, tagName)
			const entries = []
			const loweredPartial = partial.toLowerCase()
			const addEntries = (names, prefix, sortText, shouldQuote = quoted) => {
				for (const name of names) {
					const completionName = `${forcePrefix}${prefix}${name}`
					const matches =
						prefix === '.' || prefix === '@'
							? completionName.startsWith(`${forcePrefix}${partial}`)
							: completionName.toLowerCase().startsWith(`${forcePrefix}${loweredPartial}`)
					if (matches)
						entries.push({
							name: completionName,
							insertText: shouldQuote ? `'${completionName}'` : completionName,
							kind: 'property',
							sortText,
						})
				}
			}
			addEntries(completionSet.attributes, '', '1', false)
			addEntries(completionSet.booleans, '?', '2')
			addEntries(completionSet.properties, '.', '3')
			addEntries(completionSet.events, '@', '4')
			if (!partial || 'data-'.startsWith(loweredPartial))
				entries.push({
					name: `${forcePrefix}data-`,
					insertText: quoted ? `'${forcePrefix}data-'` : `${forcePrefix}data-`,
					kind: 'property',
					sortText: '5',
				})
			if (!partial || 'aria-'.startsWith(loweredPartial))
				entries.push({
					name: `${forcePrefix}aria-`,
					insertText: quoted ? `'${forcePrefix}aria-'` : `${forcePrefix}aria-`,
					kind: 'property',
					sortText: '6',
				})
			return entries
		}

		const entry = getContainingTemplateEntry(position)
		if (!entry) return completion
		const {mode, segments, holes, node} = entry
		for (const segment of segments) {
			const segmentEnd = segment.start + segment.text.length
			if (position < segment.start || position > segmentEnd) continue
			const priorText = segment.text.slice(0, position - segment.start)
			const {state} = scanTemplate([{text: priorText, start: 0}], mode)
			if (!state.currentTag || !['beforeAttr', 'attrName', 'afterAttrName'].includes(state.mode)) return completion
			const match = priorText.match(/(?:^|[\s<>"'=\/])(!?[.?@]?[A-Za-z0-9:_-]*)$/)
			if (!match) return completion
			const token = match[1]
			const forcePrefix = token.startsWith('!') ? '!' : ''
			const partial = forcePrefix ? token.slice(1) : token
			return {
				entries: buildEntries(state.currentTagNamespace, state.currentTag || 'div', partial, forcePrefix, false),
				replacementSpan: {
					start: position - token.length,
					length: token.length,
				},
			}
		}

		if (ts.isNoSubstitutionTemplateLiteral(node.template)) return completion
		for (let index = 0; index < node.template.templateSpans.length; index++) {
			const span = node.template.templateSpans[index]
			const hole = holes[index]
			if (hole?.kind !== 'spread') continue
			if (position < span.expression.getStart(sourceFile) || position > span.expression.getEnd()) continue
			const {unwrapped} = unwrapForceExpression(span.expression)
			if (!ts.isObjectLiteralExpression(unwrapped)) return completion
			const objectStart = unwrapped.getStart(sourceFile) + 1
			const objectEnd = unwrapped.getEnd() - 1
			if (position < objectStart || position > objectEnd) return completion
			const currentEntry = sourceFile.text.slice(objectStart, position).split(',').at(-1).replace(/^\s*/, '')
			if (currentEntry.includes(':')) return completion
			const match = currentEntry.match(/^(['"]?)([!?.@A-Za-z0-9:_-]*)$/)
			if (!match) return completion
			const [, quote, partial] = match
			const token = match[0]
			const replacementLength = quote ? token.length : partial.length
			return {
				entries: buildEntries(hole.namespace, hole.tagName || 'div', partial, '', true),
				replacementSpan: {
					start: position - replacementLength,
					length: replacementLength,
				},
			}
		}

		return completion
	}

	return {buildDiagnostics, getTemplateCompletions}
}

module.exports = {createDiagnostics}
