import type {
	AttributeValue,
	ChildValue,
	EventValue,
	PropertyValue,
	TemplateNodes,
	TemplateView,
} from '../src/html.js'
import {force, html} from '../src/html.js'
import type {ComponentSetupApi, PepperContext, RootContainer, RootOptions} from '../index.js'
import {component, hydrate, ref, render, renderToString, state} from '../index.js'

const key = Symbol()
const text = 'hello'
const nodes = html`<div>${text}</div>`(key)
nodes[0]

const view: TemplateView = html`<div>${['a', 1, document.createElement('span')]}</div>`
const hydratedNodes: TemplateNodes = view(key, [document.createElement('div')])
const childValue: ChildValue = html`<span>child</span>`
const attributeValue: AttributeValue = 123
const forcedText = force('forced')
const templateMetadata = view.template
forcedText
templateMetadata

type InputValue = PropertyValue<'input', 'value'>
const inputValue: InputValue = 'ok'

type ClickHandler = EventValue<MouseEvent>
const clickHandler: ClickHandler = event => event.clientX
const stringHandler: ClickHandler = 'console.log(event.type)'
const removedHandler: ClickHandler = false

attributeValue
childValue
hydratedNodes
inputValue
clickHandler
stringHandler
removedHandler
view({})

// @ts-expect-error template keys must be weak-map compatible
view(123)

const ModelComponent = component(function ModelComponent() {
	return {
		focus() {
			return true
		},
		render(tag) {
			return tag`<button>ok</button>`
		},
	}
})

const FunctionComponent = component(function FunctionComponent() {
	return tag => tag`<div>ok</div>`
})

const renderContainer = document.createElement('div')
const modelRoot = render(ModelComponent, renderContainer)
const hydratedModelRoot = hydrate(ModelComponent, renderContainer)
const functionRoot = render(FunctionComponent, renderContainer)
const selectorContainer: RootContainer = '#app'
const rootOptions: RootOptions = {context: {ready: true}, debugKeys: true}
render(FunctionComponent, selectorContainer, undefined, rootOptions)

type AppContext = {
	cart: {items: string[]}
	featureName: string
}

const ContextComponent = component(
	function ContextComponent({getContext, setContext, hasContext}: ComponentSetupApi<Record<string, never>, AppContext>) {
		const cart = getContext('cart')
		const featureName = getContext('featureName')
		const maybeMissing = getContext('missing')
		const cartSize: number = cart.items.length
		const upperName: string = featureName.toUpperCase()
		const storedFeature: string = setContext('featureName', 'cart')
		const dynamicValue = setContext('newFlag', 1)
		const hasCart = hasContext('cart')

		cartSize
		upperName
		storedFeature
		dynamicValue
		hasCart
		maybeMissing

		// @ts-expect-error context values should stay keyed by the declared context shape
		setContext('featureName', 123)

		return (tag: typeof html) => tag`<div>${featureName}</div>`
	},
)

const typedRootOptions: RootOptions<AppContext> = {
	context: {cart: {items: ['a']}, featureName: 'cart'},
	debugKeys: true,
}
const typedContextMap: RootOptions<AppContext> = {
	context: new Map<keyof AppContext, AppContext[keyof AppContext]>([
		['cart', {items: ['a']}],
		['featureName', 'cart'],
	]),
}
const typedContextValue: PepperContext = {cart: {items: ['a']}, featureName: 'cart'}
const buttonRef = ref<HTMLButtonElement>()
const [getCount, setCount] = state(0)
const nextCount = getCount()
setCount(nextCount + 1)
setCount(value => value + 1, false)
setCount(value => value + 1, () => {})

render(ContextComponent, renderContainer, {}, typedRootOptions)
render(ContextComponent, renderContainer, {}, typedContextMap)
typedContextValue
buttonRef.current
nextCount

const renderedMarkup: string = renderToString(ContextComponent, {}, typedRootOptions)
renderedMarkup

const focused: boolean = modelRoot.focus()
const hydratedFocused: boolean = hydratedModelRoot.focus()
const functionView = functionRoot.render

focused
hydratedFocused
functionView

// @ts-expect-error render() should preserve the returned component model shape
modelRoot.missingMethod()

// @ts-expect-error function components that only return a render function should not invent custom methods
functionRoot.focus()

// @ts-expect-error typed root context should reject wrong value types
const badTypedRootOptions: RootOptions<AppContext> = {context: {cart: {items: ['a']}, featureName: 1}}

// @ts-expect-error state callbacks should receive the current state type
setCount(value => value.toUpperCase())

// @ts-expect-error attribute values should be stringable primitives
const badAttributeValue: AttributeValue = () => 'nope'

// @ts-expect-error input.value should be string
const badInputValue: InputValue = 123

// @ts-expect-error click handlers must be function, string, nullish, or false
const badClickHandler: ClickHandler = 123
