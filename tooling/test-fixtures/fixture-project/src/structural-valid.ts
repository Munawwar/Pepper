import {html} from '../../../../src/html.js'

const handler = () => {}
const value = 1

html`<div>
	<!-- note --><![CDATA[ok]]>
	<script>
		const marker = '<style>'
	</script>
	<style>
		.red {
			color: red;
		}</style
	><textarea>plain text</textarea>
</div>`
html`<table>
	<tbody>
		<tr>
			<td>cell</td>
		</tr>
	</tbody>
</table>`
html`<em><span>text</span></em>`
html`<button @someevent=${handler} @someEvent=${handler} .someprop=${value} .someProp=${value}></button>`
