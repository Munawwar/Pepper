import {html} from '../../../../src/html.js'

const note = 'note'
const text = 'body'
const title = 'ready'

html`<div><!-- ${note} --></div>`
html`<script>
	const marker = '${text}'
</script>`
html`<style>
	.marker::before {
		content: '${text}';
	}
</style>`
html`<textarea>${text}</textarea>`
html`<div title="before ${title} after"></div>`
