/**
 * 最小構成のWeb Component (Custom Element)
 * Vue3コンポーネントからrefで参照されることを想定
 */
class MyElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<span>my-element</span>'
  }
}

if (!customElements.get('my-element')) {
  customElements.define('my-element', MyElement)
}
