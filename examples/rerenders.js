import {ref, render, state} from '../src/index.js'

const app = /** @type {HTMLDivElement} */ (document.getElementById('app'))

/** @typedef {(strings: TemplateStringsArray, ...values: readonly unknown[]) => unknown} HtmlTag */

/** @param {{ getProps(): { title: string, description: string, children?: () => unknown } }} api */
function DemoFrame({getProps}) {
	return /** @param {HtmlTag} html */ html => html`
		<section class="demo-card">
			<h1>${getProps().title}</h1>
			<p class="lede">${getProps().description}</p>
			${getProps().children?.()}
		</section>
	`
}

/** @param {{ getProps(): { path: string, depth: number, maxDepth: number } }} api */
function TreeNode({getProps}) {
	const nodeRef = ref()
	const [getValue, setValue] = state(0)
	let renderCount = 0
	let flashTimer = 0

	return /** @param {HtmlTag} html */ html => {
		renderCount++
		queueMicrotask(() => {
			const node = /** @type {HTMLElement | null} */ (nodeRef.current)
			if (!node) return
			node.classList.remove('tree-node--flash')
			void node.offsetWidth
			node.classList.add('tree-node--flash')
			clearTimeout(flashTimer)
			flashTimer = setTimeout(() => {
				node.classList.remove('tree-node--flash')
			}, 900)
		})
		return html`
			<li class="tree-branch">
				<article ref=${nodeRef} class="tree-node">
					<span class="tree-node__render">r${renderCount}</span>
					<div class="tree-node__value">${getValue()}</div>
					<div class="tree-node__controls">
						<button class="tree-node__button" @click=${() => setValue(getValue() - 1)}>-</button>
						<button class="tree-node__button" @click=${() => setValue(getValue() + 1)}>+</button>
					</div>
				</article>
				${getProps().depth < getProps().maxDepth
					? html`
							<ul class="tree-children">
								<${TreeNode}
									key=${`${getProps().path}L`}
									path=${`${getProps().path}L`}
									depth=${getProps().depth + 1}
									maxDepth=${getProps().maxDepth}
								/>
								<${TreeNode}
									key=${`${getProps().path}R`}
									path=${`${getProps().path}R`}
									depth=${getProps().depth + 1}
									maxDepth=${getProps().maxDepth}
								/>
							</ul>
						`
					: ''}
			</li>
		`
	}
}

function RerenderDemo() {
	const [getDepth, setDepth] = state(3)

	return /** @param {HtmlTag} html */ html => html`
		<${DemoFrame}
			title="Pepper rerender visualizer"
			description=${'Each tree node is its own component with local state. Click a deep leaf and watch which nodes flash. If ancestors flash too, Pepper is still bubbling rerenders up the tree.'}
		>
			<div class="toolbar">
				<button @click=${() => setDepth(Math.max(1, getDepth() - 1))}>- depth</button>
				<button @click=${() => setDepth(Math.min(5, getDepth() + 1))}>+ depth</button>
				<span class="meta">depth ${getDepth()}</span>
			</div>

			<p class="hint">
				Only the clicked node should flash. If parents flash too, rerenders are still bubbling.
			</p>

			<ul class="tree-root">
				<${TreeNode} key="root" path="root" depth=${0} maxDepth=${getDepth()} />
			</ul>
		</${DemoFrame}>
	`
}

render(RerenderDemo, app, {}, {debugKeys: true})
