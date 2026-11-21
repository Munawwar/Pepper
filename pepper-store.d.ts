type StoreData = Record<string, unknown>
type Subscriber = (changedProps: string[]) => void

export class Store {
	constructor(initialData?: StoreData)
	data: StoreData
	assign(newData: StoreData): void
	subscribe(propsToListenFor: string[], callback: Subscriber, context?: unknown): void
	unsubscribe(callback: Subscriber, context?: unknown): void
}
