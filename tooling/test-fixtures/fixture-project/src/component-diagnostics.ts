import {html} from '../../../../src/index.js'

const notAComponent = 123
const maybeString = 'demo'
const okayComponent = () => html`<div></div>`

html`<${notAComponent} />`
html`<${maybeString}></${maybeString}>`
html`<${okayComponent} />`
