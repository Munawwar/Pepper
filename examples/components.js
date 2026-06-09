import {render, state} from '../src/index.js'

const app = /** @type {HTMLDivElement} */ (document.getElementById('app'))

function DemoFrame({getProps}) {
	return html => html`
		<section class="demo-card">
			<h1>${getProps().title}</h1>
			<p class="lede">${getProps().description}</p>
			${getProps().children?.()}
		</section>
	`
}

function MemberRow({getProps}) {
	const [getVotes, setVotes] = state(0)

	return html => html`
		<li class="member">
			<div class="member-copy">
				<span class="tag tag--${getProps().tone}" title="spread prop on component child">
					${getProps().name}
				</span>
				<span class="meta">key=${getProps().id}</span>
			</div>
			<div class="member-controls">
				<button @click=${() => setVotes(getVotes() + 1)}>Local +1</button>
				<span>row state = ${getVotes()}</span>
			</div>
		</li>
	`
}

function ComponentsDemo() {
	const [getMembers, setMembers] = state([
		{id: 1, name: 'Alpha', tone: 'sky'},
		{id: 2, name: 'Bravo', tone: 'mint'},
		{id: 3, name: 'Charlie', tone: 'sand'},
	])
	const [getNextId, setNextId] = state(4)
	const toneOrder = ['sky', 'mint', 'sand', 'rose']

	const reverseMembers = () => setMembers(getMembers().slice().reverse())
	const rotateMembers = () =>
		setMembers(members => (members.length < 2 ? members : [...members.slice(1), members[0]]))
	const addMember = () => {
		const nextId = getNextId()
		setMembers([
			...getMembers(),
			{
				id: nextId,
				name: `Item ${nextId}`,
				tone: toneOrder[(nextId - 1) % toneOrder.length],
			},
		])
		setNextId(nextId + 1)
	}
	const removeFirst = () => setMembers(members => members.slice(1))

	return html => html`
		<${DemoFrame}
			title="Pepper nested components"
			description=${'Each row is a keyed child component with its own local state. Reorder the list and the row counts stay attached to the same ids.'}
		>
			<div class="toolbar">
				<button @click=${reverseMembers}>Reverse</button>
				<button @click=${rotateMembers}>Rotate</button>
				<button @click=${addMember}>Add row</button>
				<button @click=${removeFirst}>Remove first</button>
			</div>

			<p class="hint">Try incrementing a few rows, then reorder the list.</p>

			<ul class="members">
				${getMembers().map(member => html`<${MemberRow} key=${member.id} ...${member} />`)}
			</ul>
		</${DemoFrame}>
	`
}

render(ComponentsDemo, app, {}, {debugKeys: true})
