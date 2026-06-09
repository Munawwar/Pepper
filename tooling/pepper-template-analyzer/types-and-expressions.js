// @ts-nocheck

/**
 * @typedef {'html' | 'svg' | 'mathml'} Namespace
 * @typedef {import('typescript').Node} TsNode
 * @typedef {import('typescript').Symbol} TsSymbol
 * @typedef {import('typescript').Declaration} TsDeclaration
 * @typedef {import('typescript').Expression} TsExpression
 * @typedef {import('typescript').Type} TsType
 * @typedef {{expression: TsExpression, unwrapped: TsExpression}} ForceResult
 * @typedef {{name: string, expression: TsExpression, node: TsNode}} SpreadEntry
 */

/**
 * Test whether a declaration comes from Pepper itself, not a user shadowing.
 * @param {TsDeclaration} declaration
 */
function isPepperDeclaration(declaration) {
	const fileName = declaration.getSourceFile().fileName.replace(/\\/g, '/').toLowerCase()
	return /(^|\/)html\.(d\.ts|js)$/.test(fileName) || fileName.includes('/pepper/')
}

/**
 * Strip syntax-only wrappers so type checks inspect the underlying expression.
 * @param {typeof import('typescript')} ts
 * @param {TsExpression} expression
 * @returns {TsExpression}
 */
function unwrapExpression(ts, expression) {
	let current = expression
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isTypeAssertionExpression(current) ||
		ts.isNonNullExpression(current)
	)
		current = current.expression
	return current
}

/**
 * Create TypeScript symbol/type helpers shared by diagnostics and discovery.
 * @param {object} context
 */
function createTypesAndExpressions(context) {
	const {ts, checker, sourceFile, caches} = context

	function getResolvedSymbol(node) {
		let symbol = checker.getSymbolAtLocation(node)
		if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
		return symbol || null
	}

	function getGlobalType(name) {
		if (caches.globalTypes.has(name)) return caches.globalTypes.get(name)
		const symbol = checker.resolveName(name, sourceFile, ts.SymbolFlags.Type, false)
		const type = symbol ? checker.getDeclaredTypeOfSymbol(symbol) : null
		caches.globalTypes.set(name, type)
		return type
	}

	function getTagType(mapName, tagName) {
		const cacheKey = `${mapName}:${tagName}`
		if (caches.tagMapTypes.has(cacheKey)) return caches.tagMapTypes.get(cacheKey)
		const mapType = getGlobalType(mapName)
		const property = mapType && checker.getPropertyOfType(mapType, tagName)
		const type = property ? checker.getTypeOfSymbolAtLocation(property, sourceFile) : null
		caches.tagMapTypes.set(cacheKey, type)
		return type
	}

	function resolveElementType(namespace, tagName) {
		const loweredTagName = tagName.toLowerCase()
		const htmlType = getTagType('HTMLElementTagNameMap', loweredTagName)
		const svgType = getTagType('SVGElementTagNameMap', loweredTagName)
		const mathType = getTagType('MathMLElementTagNameMap', loweredTagName)
		if (namespace === 'svg') return svgType || htmlType || null
		if (namespace === 'mathml') return mathType || htmlType || null
		if (namespace === 'html') {
			if (htmlType) return htmlType
			if (!htmlType && svgType && !mathType) return svgType
			if (!htmlType && mathType && !svgType) return mathType
		}
		return htmlType || svgType || mathType || null
	}

	function unwrapForceExpression(expression) {
		const current = unwrapExpression(ts, expression)
		if (!ts.isCallExpression(current) || current.arguments.length !== 1)
			return {expression: current, unwrapped: current}
		if (!ts.isIdentifier(current.expression) || current.expression.text !== 'force')
			return {expression: current, unwrapped: current}
		const symbol = getResolvedSymbol(current.expression)
		if (!symbol) return {expression: current, unwrapped: current}
		for (const declaration of symbol.declarations || [])
			if (isPepperDeclaration(declaration)) return {expression: current, unwrapped: current.arguments[0]}
		return {expression: current, unwrapped: current}
	}

	function resolveSpreadEntries(expression) {
		let current = unwrapExpression(ts, expression)
		if (ts.isIdentifier(current)) {
			const symbol = checker.getSymbolAtLocation(current)
			if (
				symbol?.valueDeclaration &&
				ts.isVariableDeclaration(symbol.valueDeclaration) &&
				symbol.valueDeclaration.initializer
			)
				current = symbol.valueDeclaration.initializer
		}
		if (!ts.isObjectLiteralExpression(current)) return null
		const entries = []
		for (const property of current.properties) {
			if (ts.isShorthandPropertyAssignment(property)) {
				entries.push({name: property.name.text, expression: property.name, node: property.name})
				continue
			}
			if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) continue
			const name = ts.isIdentifier(property.name)
				? property.name.text
				: ts.isStringLiteralLike(property.name) || ts.isNumericLiteral(property.name)
					? property.name.text
					: null
			if (!name) continue
			entries.push({name, expression: property.initializer, node: property.name})
		}
		return entries
	}

	return {
		getResolvedSymbol,
		isPepperDeclaration,
		getGlobalType,
		getTagType,
		resolveElementType,
		unwrapExpression: expression => unwrapExpression(ts, expression),
		unwrapForceExpression,
		resolveSpreadEntries,
	}
}

module.exports = {createTypesAndExpressions}
