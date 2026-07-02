/** @type {(value: string) => void} */
const emit = /** @type {Record<string, unknown>} */ (globalThis).print === undefined
	? console.log
	: /** @type {(value: string) => void} */ (/** @type {Record<string, unknown>} */ (globalThis).print)

/**
 * @param {TemplateStringsArray} strings
 * @param {...unknown} _values
 * @returns {TemplateStringsArray}
 */
function capture(strings, ..._values) {
	return strings
}

/** @param {unknown} value */
function sameSite(value) {
	return capture`site:${value}:end`
}

/** @param {unknown} value */
function siteA(value) {
	return capture`site:${value}:end`
}

/** @param {unknown} value */
function siteB(value) {
	return capture`site:${value}:end`
}

const first = sameSite(1)
const second = sameSite(2)
const third = siteA(3)
const fourth = siteB(4)

emit(
	JSON.stringify(
		{
			sameSiteSameArray: first === second,
			sameSiteRawSameArray: first.raw === second.raw,
			differentSitesSameArray: third === fourth,
			differentSitesRawSameArray: third.raw === fourth.raw,
			stringsFrozen: Object.isFrozen(first),
			rawFrozen: Object.isFrozen(first.raw),
			cookedParts: Array.from(first),
			rawParts: Array.from(first.raw),
		},
		null,
		2,
	),
)
