// @ts-nocheck

const {createDiscoveryAndScan} = require('./discovery-and-scan.js')
const {createDiagnostics} = require('./diagnostics.js')
const {createTypesAndExpressions} = require('./types-and-expressions.js')

const DIAGNOSTIC_CODES = {
	attributeValue: 91001,
	booleanAttributeValue: 91002,
	propertyValue: 91003,
	eventValue: 91004,
	eventParameter: 91005,
	spreadValue: 91006,
	spreadEntryValue: 91007,
	componentTagValue: 91008,
	missingClosingTag: 92001,
	mismatchedClosingTag: 92002,
	implicitOptionalEndTag: 92003,
	invalidNesting: 92004,
	implicitTbody: 92005,
	invalidTableStructure: 92006,
	duplicateAttribute: 92007,
	voidContent: 92008,
	closeTagAttribute: 92009,
	invalidElementName: 92010,
	invalidElementParent: 92011,
}
const STRUCTURAL_RULES = {
	missingClosingTag: 'pepper/missing-closing-tag',
	mismatchedClosingTag: 'pepper/mismatched-closing-tag',
	implicitOptionalEndTag: 'pepper/implicit-optional-end-tag',
	invalidNesting: 'pepper/invalid-nesting',
	implicitTbody: 'pepper/implicit-tbody',
	invalidTableStructure: 'pepper/invalid-table-structure',
	duplicateAttribute: 'pepper/duplicate-attribute',
	voidContent: 'pepper/void-content',
	closeTagAttribute: 'pepper/close-tag-attribute',
	invalidElementName: 'pepper/invalid-element-name',
	invalidElementParent: 'pepper/invalid-element-parent',
}

const VOID_HTML_TAGS = new Set([
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
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title', 'template'])
const COMPONENT_TAG_PLACEHOLDER = '__pepper_component__'
const PHRASING_ONLY_TAGS = new Set([
	'a',
	'abbr',
	'b',
	'bdi',
	'bdo',
	'cite',
	'code',
	'data',
	'dfn',
	'em',
	'i',
	'kbd',
	'label',
	'mark',
	'meter',
	'output',
	'progress',
	'q',
	'rp',
	'rt',
	'ruby',
	's',
	'samp',
	'small',
	'span',
	'strong',
	'sub',
	'sup',
	'time',
	'u',
	'var',
])
const KNOWN_HTML_TAGS = new Set(
	`a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark math menu meta meter nav noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr track u ul var video wbr`.split(
		' ',
	),
)
const NON_PHRASING_CHILD_TAGS = new Set([
	'address',
	'article',
	'aside',
	'blockquote',
	'details',
	'div',
	'dl',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hgroup',
	'hr',
	'main',
	'menu',
	'nav',
	'ol',
	'p',
	'pre',
	'search',
	'section',
	'table',
	'ul',
])
const CHILD_TAG_ALLOWLISTS = new Map(
	Object.entries({
		datalist: 'option script template',
		html: 'head body',
		head: 'base link meta noscript script style template title',
		optgroup: 'option script template',
		ol: 'li script template',
		picture: 'source img script template',
		select: 'option optgroup hr script template',
		table: 'caption colgroup thead tbody tfoot tr script template',
		tbody: 'tr script template',
		tfoot: 'tr script template',
		thead: 'tr script template',
		tr: 'td th script template',
		ul: 'li script template',
	}).map(([tag, children]) => [tag, new Set(children.split(' '))]),
)
const OPTIONAL_END_TAG_OPEN_RULES = new Map([
	['li', new Set(['li'])],
	['tr', new Set(['tr'])],
	['td', new Set(['td', 'th'])],
	['th', new Set(['td', 'th'])],
	['p', NON_PHRASING_CHILD_TAGS],
])
const PEPPER_TAG_MODES = new Set(['html', 'svg', 'mathml'])
const DEFAULT_ATTRIBUTE_COMPLETIONS = ['class', 'id', 'title', 'style', 'slot', 'part', 'role', 'tabindex']
const DEFAULT_BOOLEAN_COMPLETIONS = ['hidden']
const DEFAULT_EVENT_COMPLETIONS = ['click', 'input', 'change', 'submit', 'keydown', 'keyup']

const analyzerCache = new WeakMap()

/**
 * @typedef {{name: string, insertText: string, kind: string, sortText: string}} CompletionEntry
 * @typedef {{entries: CompletionEntry[], replacementSpan: {start: number, length: number}}} CompletionResult
 * @typedef {{buildDiagnostics(): import('typescript').Diagnostic[], getTemplateCompletions(position: number): CompletionResult | null}} Analyzer
 */

/**
 * Build the per-source-file analyzer facade used by diagnostics and completions.
 * @param {typeof import('typescript')} ts
 * @param {import('typescript').Program} program
 * @param {import('typescript').SourceFile} sourceFile
 * @returns {Analyzer}
 */
function createAnalyzer(ts, program, sourceFile) {
	const context = {
		ts,
		checker: program.getTypeChecker(),
		sourceFile,
		caches: {
			tagMapTypes: new Map(),
			globalTypes: new Map(),
			completionSets: new Map(),
			templateEntries: new WeakMap(),
		},
		cachedDiagnostics: null,
		cachedTemplateEntries: null,
		cachedTemplateRanges: null,
		constants: {
			DIAGNOSTIC_CODES,
			STRUCTURAL_RULES,
			VOID_HTML_TAGS,
			RAW_TEXT_TAGS,
			COMPONENT_TAG_PLACEHOLDER,
			PHRASING_ONLY_TAGS,
			KNOWN_HTML_TAGS,
			NON_PHRASING_CHILD_TAGS,
			CHILD_TAG_ALLOWLISTS,
			OPTIONAL_END_TAG_OPEN_RULES,
			PEPPER_TAG_MODES,
			DEFAULT_ATTRIBUTE_COMPLETIONS,
			DEFAULT_BOOLEAN_COMPLETIONS,
			DEFAULT_EVENT_COMPLETIONS,
		},
	}
	context.types = createTypesAndExpressions(context)
	context.discovery = createDiscoveryAndScan(context)
	return createDiagnostics(context)
}

/**
 * Return the analyzer cached for the current TypeScript Program/SourceFile pair.
 * @param {typeof import('typescript')} ts
 * @param {import('typescript').Program} program
 * @param {import('typescript').SourceFile} sourceFile
 * @returns {Analyzer}
 */
function getAnalyzer(ts, program, sourceFile) {
	const cached = analyzerCache.get(sourceFile)
	if (cached?.program === program && cached.ts === ts) return cached.analyzer
	const analyzer = createAnalyzer(ts, program, sourceFile)
	analyzerCache.set(sourceFile, {program, ts, analyzer})
	return analyzer
}

/**
 * Entry point used by the TypeScript plugin and CLI to produce diagnostics.
 * @param {typeof import('typescript')} ts
 * @param {import('typescript').Program} program
 * @param {import('typescript').SourceFile} sourceFile
 * @returns {import('typescript').Diagnostic[]}
 */
function analyzeSourceFile(ts, program, sourceFile) {
	return getAnalyzer(ts, program, sourceFile).buildDiagnostics()
}

/**
 * Entry point used by the TypeScript plugin to produce template completions.
 * @param {typeof import('typescript')} ts
 * @param {import('typescript').Program} program
 * @param {import('typescript').SourceFile} sourceFile
 * @param {number} position
 * @returns {CompletionResult | null}
 */
function getCompletionsAtPosition(ts, program, sourceFile, position) {
	return getAnalyzer(ts, program, sourceFile).getTemplateCompletions(position)
}

module.exports = {
	analyzeSourceFile,
	getCompletionsAtPosition,
}
