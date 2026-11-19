// @ts-nocheck

import assert from 'node:assert/strict'
import test from 'node:test'
import {compileComponentTemplate} from '../src/component-syntax.js'
import {Store} from '../src/store.js'

const importModule = specifier => import(specifier)

async function loadBuiltRenderers() {
	const [browser, ssr] = await Promise.all([
		importModule('../dist/index.js'),
		importModule('../dist/ssr.js'),
	])
	return {browser, ssr}
}

async function readJson(relativePath) {
	const {readFile} = await importModule('node:fs/promises')
	return JSON.parse(await readFile(new URL(relativePath, import.meta.url), 'utf8'))
}

test('[CACHE] component-free template analysis is cached', () => {
	let reads = 0
	const strings = Object.assign([], {raw: ['<div></div>']})
	Object.defineProperty(strings, 0, {
		get() {
			reads++
			return '<div></div>'
		},
	})

	assert.equal(compileComponentTemplate(strings), null)
	const firstReads = reads
	assert.equal(compileComponentTemplate(strings), null)
	assert.equal(reads, firstReads)
})

test('[A01] browser state helper participates in a built SSR render', async () => {
	const {browser, ssr} = await loadBuiltRenderers()

	function App() {
		const [getCount] = browser.state(2)
		return html => html`<span>${getCount()}</span>`
	}

	assert.equal(ssr.renderComponentToString(App), '<span>2</span>')
})

test('[A01] browser ref helper participates in a built SSR render', async () => {
	const {browser, ssr} = await loadBuiltRenderers()

	function App() {
		const elementRef = browser.ref()
		assert.equal(elementRef.current, null)
		return html => html`<span>ref</span>`
	}

	assert.equal(ssr.renderComponentToString(App), '<span>ref</span>')
})

test('[A01] browser stableId helper participates in a built SSR render', async () => {
	const {browser, ssr} = await loadBuiltRenderers()

	function App() {
		const id = browser.stableId()
		return html => html`<label for=${id}></label><input id=${id}>`
	}

	const output = ssr.renderComponentToString(App)
	const id = output.match(/id="([^"]+)"/)?.[1]
	assert.ok(id)
	assert.match(output, new RegExp(`for="${id}"`))
})

test('[A01] built SSR recognizes browser trusted HTML values', async () => {
	const {browser, ssr} = await loadBuiltRenderers()

	function App() {
		return html => html`<div>${browser.unsafeHTML('<b>trusted</b>')}</div>`
	}

	assert.equal(ssr.renderComponentToString(App), '<div><b>trusted</b></div>')
})

test('[A01] built SSR recognizes every browser value brand', async () => {
	const {browser, ssr} = await loadBuiltRenderers()

	function App() {
		return html => html`
			<div>${browser.force('forced')}</div>
			<svg>${browser.unsafeSVG('<circle></circle>')}</svg>
			<math>${browser.unsafeMathML('<mi>x</mi>')}</math>
			<script>${browser.rawText('const n = 2 < 3;')}</script>
		`
	}

	assert.equal(
		ssr.renderComponentToString(App),
		'<div>forced</div><svg><circle></circle></svg><math><mi>x</mi></math><script>const n = 2 < 3;</script>',
	)
})

test('[A01] built SSR omits a portal imported from the browser entry', async () => {
	const {browser, ssr} = await loadBuiltRenderers()

	function App() {
		return html => html`<main>${browser.portal('#outlet', html`<b>portal</b>`)}</main>`
	}

	assert.equal(ssr.renderComponentToString(App), '<main></main>')
})

test('[A01] built SSR recognizes browser component boundary metadata', async () => {
	const {browser, ssr} = await loadBuiltRenderers()
	const Boundary = browser.component(function Boundary({getError, getProps}) {
		return html => getError() ? html`<p>fallback</p>` : getProps().children?.()
	}, {errorBoundary: true})

	function Broken() {
		return () => {
			throw new Error('boom')
		}
	}

	function App() {
		return html => html`<${Boundary}><${Broken} /></${Boundary}>`
	}

	assert.equal(ssr.renderComponentToString(App), '<p>fallback</p>')
})

test('[A15] SSR rawText matches browser text semantics in normal elements', async () => {
	const {html, rawText, renderToString} = await import('../src/html-ssr.js')

	assert.equal(
		renderToString(html`<div>${rawText('<b>x</b>')}</div>`),
		'<div>&lt;b&gt;x&lt;/b&gt;</div>',
	)
})

test.skip('[A16] SSR never emits internal interpolation markers in comments', async () => {
	const {html, renderToString} = await import('../src/html-ssr.js')
	const output = renderToString(html`<!-- ${'ignored'} --><p>ok</p>`)

	assert.doesNotMatch(output, /⧙⧘\d+⧙⧘/)
})

test('[A17] Store notifies subscribers about a constructor key change', () => {
	const store = new Store({constructor: 1})
	const notifications = []
	store.subscribe(['constructor'], changedProps => notifications.push(changedProps))

	store.data = {constructor: 2}

	assert.deepEqual(notifications, [['constructor']])
})

test('[A17] Store rejects an own __proto__ key before changing data or notifying subscribers', () => {
	const invalid = JSON.parse('{"value":2,"__proto__":{}}')
	const data = {value: 1}
	const store = new Store(data)
	const changes = []
	store.subscribe(['value'], keys => changes.push(keys))

	assert.throws(() => new Store(invalid), /__proto__/)
	assert.throws(() => { store.data = invalid }, /__proto__/)
	assert.throws(() => store.assign(invalid), /__proto__/)
	assert.equal(store.data, data)
	assert.equal(store.data.value, 1)
	assert.equal(Object.getPrototypeOf(data), Object.prototype)
	assert.deepEqual(changes, [])
})

test.skip('[TOOLING] browser unit config excludes Node-only SSR tests', async () => {
	const config = (await import('./web-test-runner.unit.config.mjs')).default

	assert.ok(
		config.files.some(pattern => pattern === '!test/ssr.test.js' || pattern === '!test/**/*.node.test.js'),
		'The browser config must explicitly exclude Node-only tests',
	)
})

test.skip('[TOOLING] test:dom runs every browser unit suite', async () => {
	const packageJson = await readJson('../package.json')
	const script = packageJson.scripts['test:dom']

	assert.doesNotMatch(script, /--files\s+test\/pepper\.test\.js/)
})

test.skip('[TOOLING] lint:templates supplies a default TypeScript project', async () => {
	const packageJson = await readJson('../package.json')

	assert.match(packageJson.scripts['lint:templates'], /(?:--project|-p)\s+\S+/)
})

test('[TOOLING] VS Code manifest points at the Pepper repository', async () => {
	const manifest = await readJson('../tooling/pepper-vscode/package.json')

	assert.equal(manifest.repository.url, 'https://github.com/Munawwar/pepper.git')
})
