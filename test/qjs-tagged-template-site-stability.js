function capture(strings) {
	return strings
}

function sameSite(value) {
	return capture`site:${value}:end`
}

function siteA(value) {
	return capture`site:${value}:end`
}

function siteB(value) {
	return capture`site:${value}:end`
}

const first = sameSite(1)
const second = sameSite(2)
const third = siteA(3)
const fourth = siteB(4)

print(
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
