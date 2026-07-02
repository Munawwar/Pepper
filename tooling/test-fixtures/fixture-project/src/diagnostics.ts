import {force, html} from '../../../../src/html.js'

const okaySpread = {
	title: 'ready',
	'?hidden': true,
	'@click': (event: MouseEvent) => event.type,
}

const wrongSpread = {
	'.value': 123,
	'@click': 123,
	'?checked': 'yes',
}

html`<input value=${123} />`
html`<input ?checked=${'yes'} />`
html`<input .value=${123} />`
html`<button @click=${(event: KeyboardEvent) => event.key}></button>`
html`<button @click=${123}></button>`
html`<button ...${123}></button>`
html`<input ...${wrongSpread} />`
html`<my-widget .value=${123} @change=${123}></my-widget>`

html`<input value=${force('ok')} />`
html`<button @click=${'console.log(event.type)'}></button>`
html`<input ...${okaySpread} />`
