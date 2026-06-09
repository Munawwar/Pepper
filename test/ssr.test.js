// @ts-nocheck

import test from 'node:test'
import assert from 'node:assert/strict'

import {
	clearTemplateCache,
	component,
	force,
	html,
	mathml,
	rawText,
	renderComponentToString,
	renderToString,
	state,
	svg,
	unsafeHTML,
	unsafeMathML,
	unsafeSVG,
} from '../src/pepper-ssr.js'

test('renders text content and trims top-level formatting whitespace', () => {
	const output = renderToString(html`
		<div>${'<hello & goodbye>'}</div>
		${'world'}
	`)

	assert.equal(output, '<div>&lt;hello &amp; goodbye&gt;</div>world')
})

test('renders regular and boolean attributes while omitting property and event bindings', () => {
	const output = renderToString(html`
		<button title="${'save & close'}" ?hidden=${true} .value=${'ignored'} @click=${() => {}}></button>
	`)

	assert.equal(output, '<button title="save &amp; close" hidden=""></button>')
})

test('renders mixed static and dynamic attributes', () => {
	const dynamicClass = 'b'
	const output = renderToString(html`<div class="a ${dynamicClass} c" data-x=${1} title=${null}></div>`)

	assert.equal(output, '<div class="a b c" data-x="1" title=""></div>')
})

test('applies attribute precedence in template order', () => {
	const output = renderToString(html`
		<div
			title="before"
			...${{title: 'from spread', '.foo': 'ignored', '@click': 'ignored'}}
			data-x=${1}
			title=${'after'}
		></div>
	`)

	assert.equal(output, '<div title="after" data-x="1"></div>')
})

test('applies spread bindings with the same serializable rules as explicit attributes', () => {
	const output = renderToString(
		html`<button ...${{title: null, '?hidden': true, '.foo': 'bar', '@click': 'x'}}></button>`,
	)

	assert.equal(output, '<button title="" hidden=""></button>')
})

test('renders the boolean attribute matrix', () => {
	assert.equal(renderToString(html`<div ?hidden=${true}></div>`), '<div hidden=""></div>')
	assert.equal(renderToString(html`<div ?hidden=${false}></div>`), '<div></div>')
	assert.equal(renderToString(html`<div ?hidden=""></div>`), '<div></div>')
	assert.equal(renderToString(html`<div ?hidden="abc"></div>`), '<div hidden=""></div>')
	assert.equal(renderToString(html`<div ...${{'?hidden': false}}></div>`), '<div></div>')
})

test('renders void elements without closing tags', () => {
	// prettier-ignore
	const output = renderToString(html`
		<img src=${'/a?b&c'} alt=${'x'}>
		<input value=${'hello'}>
		<br>
		<meta charset="utf-8">
		<link rel="preload" href=${'/style.css?a&b'}>
	`)

	assert.equal(
		output,
		'<img src="/a?b&amp;c" alt="x"><input value="hello"><br><meta charset="utf-8"><link rel="preload" href="/style.css?a&amp;b">',
	)
})

test('escapes text and attribute values', () => {
	const output = renderToString(html`<div title=${'"&<>'}>${'&<>'}</div>`)

	assert.equal(output, '<div title="&quot;&amp;&lt;&gt;">&amp;&lt;&gt;</div>')
})

test('renders unsafeHTML without escaping', () => {
	const output = renderToString(html`<div>${unsafeHTML('<span class="x">ok</span>')}</div>`)

	assert.equal(output, '<div><span class="x">ok</span></div>')
})

test('renders unsafeSVG and unsafeMathML without escaping', () => {
	assert.equal(renderToString(svg`<svg>${unsafeSVG('<circle cx="5" cy="5" r="5"></circle>')}</svg>`), '<svg><circle cx="5" cy="5" r="5"></circle></svg>')
	assert.equal(renderToString(mathml`<math>${unsafeMathML('<mi>x</mi>')}</math>`), '<math><mi>x</mi></math>')
})

test('renders rawText with raw-text-safe replacements', () => {
	// prettier-ignore
	const output = renderToString(
		html`<script>${rawText('var x = "</style></script></textarea></title></template><script><!--<style>";')}</script>`,
	)

	assert.equal(
		output,
		'<script>var x = "\\x3C/style>\\x3C/script>\\x3C/textarea>\\x3C/title>\\x3C/template>\\x3Cscript>\\x3C!--\\x3Cstyle>";</script>',
	)
})

test('supports CDATA blocks during SSR', () => {
	const output = renderToString(svg`<![CDATA[a > b]]><text>${'x'}</text>`)

	assert.equal(output, '<![CDATA[a > b]]><text>x</text>')
})

test('serializes primitive text values', () => {
	assert.equal(renderToString(0), '0')
	assert.equal(renderToString(false), 'false')
	assert.equal(renderToString(true), 'true')
	assert.equal(renderToString(''), '')
	assert.equal(renderToString(null), '')
	assert.equal(renderToString(undefined), '')
	assert.equal(renderToString(42n), '42')
})

test('renders nested templates, arrays, svg, and mathml content', () => {
	const output = renderToString(html`
		<ul>
			${['red', 'blue'].map(color => html`<li>${color}</li>`)}
		</ul>
		<svg>${svg`<circle cx=${1} cy=${2} r=${3}></circle>`}</svg>
		<math>${mathml`<mi>${'x'}</mi>`}</math>
	`)

	assert.equal(
		output,
		'<ul>\n\t\t\t<li>red</li><li>blue</li>\n\t\t</ul><svg><circle cx="1" cy="2" r="3"></circle></svg><math><mi>x</mi></math>',
	)
})

test('renders nested svg and mathml arrays inside html', () => {
	// prettier-ignore
	const output = renderToString(html`
		<section>
			<svg>
				${[1, 2].map(index => svg`<circle cx=${index} cy=${index} r=${index}></circle>`)}
			</svg>
			<math>
				${['x', 'y'].map(value => mathml`<mi>${value}</mi>`)}
			</math>
		</section>
	`)

	assert.equal(
		output,
		'<section>\n\t\t\t<svg>\n\t\t\t\t<circle cx="1" cy="1" r="1"></circle><circle cx="2" cy="2" r="2"></circle>\n\t\t\t</svg>\n\t\t\t<math>\n\t\t\t\t<mi>x</mi><mi>y</mi>\n\t\t\t</math>\n\t\t</section>',
	)
})

test('renders deeply nested arrays with nullish items and templates', () => {
	const output = renderToString([null, ['a', [false, 0, html`<span>x</span>`]], undefined])

	assert.equal(output, 'afalse0<span>x</span>')
})

test('trims top-level whitespace while preserving inner-element whitespace', () => {
	// prettier-ignore
	const output = renderToString(html`
		${'x'}
		<div> a ${'b'} c </div>
	`)

	assert.equal(output, 'x<div> a b c </div>')
})

test('accepts force() wrappers during SSR', () => {
	const output = renderToString(html`<div class=${force('ready')}>${force('ok')}</div>`)

	assert.equal(output, '<div class="ready">ok</div>')
})

test('clearTemplateCache resets compiled SSR templates without changing output', () => {
	const template = html`<div title=${'a'}>${'b'}</div>`

	assert.equal(renderToString(template), '<div title="a">b</div>')
	clearTemplateCache()
	assert.equal(renderToString(template), '<div title="a">b</div>')
})

test('throws when unsafe helpers or rawText are used outside text content', () => {
	assert.throws(() => renderToString(html`<div title=${unsafeHTML('<span>nope</span>')}></div>`), /text content/)
	assert.throws(() => renderToString(html`<div title=${unsafeSVG('<circle></circle>')}></div>`), /text content/)
	assert.throws(() => renderToString(html`<div title=${unsafeMathML('<mi>x</mi>')}></div>`), /text content/)
	assert.throws(() => renderToString(html`<div title=${rawText('nope')}></div>`), /text content/)
})

test('throws when unsafe helpers or rawText receive non-string values', () => {
	assert.throws(() => unsafeHTML(/** @type {any} */ (123)), /expect a string/)
	assert.throws(() => unsafeSVG(/** @type {any} */ (123)), /expect a string/)
	assert.throws(() => unsafeMathML(/** @type {any} */ (123)), /expect a string/)
	assert.throws(() => rawText(/** @type {any} */ (html`<span>nope</span>`)), /expect a string/)
})

test('throws when nested templates are used inside attribute values', () => {
	assert.throws(() => renderToString(html`<div title=${html`<span>nope</span>`}></div>`), /Nested templates/)
})

test('renders self-closing component tags in SSR templates', () => {
	function Child({getProps}) {
		return h => h`<span>${getProps().label}</span>`
	}

	assert.equal(renderToString(html`<div><${Child} label=${'ok'} /></div>`), '<div><span>ok</span></div>')
})

test('renders paired component tags with lazy children in SSR templates', () => {
	function Layout({getProps}) {
		return h => h`<section>${getProps().children ? getProps().children() : ''}</section>`
	}

	assert.equal(
		renderToString(html`<${Layout}><span>${'hello'}</span></${Layout}>`),
		'<section><span>hello</span></section>',
	)
})

test('applies spread props and keyed component lists in SSR templates', () => {
	function Row({getProps}) {
		return h => h`<li>${getProps().label}</li>`
	}

	const sharedProps = {label: 'shared', title: 'ignored'}
	assert.equal(
		renderToString(html`<ul>${[1, 2].map(index => html`<${Row} key=${index} ...${sharedProps} label=${'item-' + index} />`)}</ul>`),
		'<ul><li>item-1</li><li>item-2</li></ul>',
	)
})

test('renders component roots to strings through Pepper SSR runtime', () => {
	const Counter = component(({getProps}) => {
		const [getCount] = state(getProps().count)
		return html => html`<button>${getCount()}</button>`
	})

	assert.equal(renderComponentToString(Counter, {count: 3}), '<button>3</button>')
})
