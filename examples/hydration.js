import {html} from '../src/html.js'

const app = /** @type {HTMLDivElement} */ (document.getElementById('app'))
const serverValue = 'hello'
const key = Symbol()

const liveInput = /** @type {HTMLInputElement} */ (app.querySelector('input'))

liveInput.value = 'hello world'

setTimeout(() => {
	const liveNodes = Array.from(app.childNodes)
	html`
		<div class="demo">
			<h1>Pseudo-hydration preserves live input state</h1>
			<p>The server markup starts with <code>value="hello"</code>. We simulate a user typing before hydration runs.</p>
			<div class="nested">
				<div class="field">
					<label for="greeting">Greeting</label>
					<input id="greeting" value=${serverValue} />
				</div>
			</div>
			<div class="result">Did hydration preserve "hello world"? Wait for it...</div>
		</div>
	`(key, liveNodes)

	const hydratedInput = /** @type {HTMLInputElement} */ (app.querySelector('input'))
	const preserved = hydratedInput.value === 'hello world'
	const result = /** @type {HTMLDivElement} */ (app.querySelector('.result'))

	result.textContent = preserved
		? 'Did hydration preserve "hello world"? Yes (Works!)'
		: 'Did hydration preserve "hello world"? No (Bug!)'
}, 1000)
