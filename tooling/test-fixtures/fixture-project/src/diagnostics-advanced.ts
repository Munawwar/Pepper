import {force, html} from '../../../../src/html.js'

const title = 123
const spreadKey = 'title'

function localForce(value: number) {
	return value
}

html`<input value=${force('ok')} />`
html`<input value=${localForce(123)} />`
html`<input ...${{title}} />`
html`<input ...${{[spreadKey]: 123}} />`
html`<button @click=${false}></button>`
html`<button @click=${null}></button>`
html`<button @click=${undefined}></button>`
