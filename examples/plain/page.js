import { state } from '../../src/index.js';

export default function CounterDemo({ getProps }) {
  const [getCount, setCount] = state(getProps().initialCount);
  const onIncrementClick = () => setCount(getCount() + 1);
  return function render(html) {
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
