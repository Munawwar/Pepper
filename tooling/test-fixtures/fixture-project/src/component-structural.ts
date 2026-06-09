import {html} from '../../../../src/index.js'

const Alpha = () => html`<div></div>`
const Bravo = () => html`<div></div>`

html`<${Alpha}></${Bravo}>`
html`<${Alpha}>`
