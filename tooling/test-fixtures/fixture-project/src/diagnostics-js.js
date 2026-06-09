import {html} from '../../../../src/html.js'

/** @type {number} */
const count = 123

/** @type {string} */
const hidden = 'yes'

html`<input value=${count} />`
html`<input ?hidden=${hidden} />`
