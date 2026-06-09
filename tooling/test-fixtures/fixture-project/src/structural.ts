import {html} from '../../../../src/html.js'

// pepper/missing-closing-tag
// prettier-ignore
html`<section><div></div>`

// pepper/mismatched-closing-tag
html`<div></span></div>`

// pepper/implicit-optional-end-tag
// prettier-ignore
html`<ul><li>one<li>two</li></ul>`

// pepper/invalid-nesting
html`<em><p>text</p></em>`

// pepper/invalid-nesting
html`<a href="#"><a href="#">nested</a></a>`

// pepper/implicit-tbody
// prettier-ignore
html`<table><tr><td>cell</td></tr></table>`

// pepper/invalid-table-structure
// prettier-ignore
html`<table><td>cell</td></table>`

// pepper/invalid-table-structure
// prettier-ignore
html`<div><tr><td>cell</td></tr></div>`

const value = 'x'

// pepper/duplicate-attribute
html`<div>
	<span title=${value} title="y"></span>
</div>`

// pepper/void-content
html`<input>text</input>`

// pepper/close-tag-attribute
html`<div></div class="x">`

// pepper/invalid-element-name
html`<not></not>`

// pepper/invalid-element-parent
html`<body>
	<title>x</title>
</body>`
