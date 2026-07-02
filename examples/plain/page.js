import { state } from '../../src/index.js';

/** @typedef {(strings: TemplateStringsArray, ...values: readonly unknown[]) => unknown} HtmlTag */
/** @param {{ getProps(): Record<string, unknown> }} api */
export default function CounterDemo({ getProps }) {
  const initialCount = /** @type {{ initialCount: number }} */ (getProps()).initialCount;
  const [getCount, setCount] = state(initialCount);
  const onIncrementClick = () => setCount(getCount() + 1);
  return function render(/** @type {HtmlTag} */ html) {
    return html`
      <div class="counter-block">
        <div>Hydrated counter</div>
        <div class="counter-row">
          <button @click=${onIncrementClick}>Increase</button>
          <span>Counter = ${getCount()}</span>
        </div>
      </div>
      <div class="counter-block">
        <div>Mirrored value</div>
        <span>Counter = ${getCount()}</span>
      </div>
    `;
  };
}
