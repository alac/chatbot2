// <vn-avatar crop="bust" expression="happy" finish="1"></vn-avatar>
//   el.spec = characterJson;        // or the attribute spec='{"..."}'
// Rendered in shadow DOM, so page CSS and avatar CSS never touch.
import { createAvatar } from './render.js';

const ATTRS = ['crop', 'expression', 'outfit', 'finish', 'breathing', 'blinking', 'spec'];

class VnAvatar extends HTMLElement {
  static get observedAttributes() { return ATTRS; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{display:block}div{width:100%;height:100%}</style><div></div>';
    this._spec = {};
    this._avatar = null;
  }

  connectedCallback() {
    if (this._avatar) return;
    this._avatar = createAvatar(this.shadowRoot.querySelector('div'), this._spec, this._state());
  }

  disconnectedCallback() {
    if (this._avatar) this._avatar.destroy();
    this._avatar = null;
  }

  attributeChangedCallback(name, _old, value) {
    if (name === 'spec') {
      try { this.spec = JSON.parse(value); } catch { /* keep the current spec */ }
    } else if (this._avatar) {
      this._avatar.set(this._state());
    }
  }

  _state() {
    const s = {}, a = n => this.getAttribute(n);
    if (a('crop')) s.crop = a('crop');
    if (a('expression')) s.expression = a('expression');
    if (a('outfit')) s.outfit = a('outfit');
    if (a('finish') != null) s.finish = Number(a('finish'));
    if (a('breathing') != null) s.breathing = a('breathing') !== 'false';
    if (a('blinking') != null) s.blinking = a('blinking') !== 'false';
    return s;
  }

  get spec() { return this._avatar ? this._avatar.spec : this._spec; }
  set spec(value) {
    this._spec = value || {};
    if (this._avatar) this._avatar.update(this._spec);
  }

  /** The underlying avatar object (set, update, toBlob), once connected. */
  get avatar() { return this._avatar; }
}

if (!customElements.get('vn-avatar')) customElements.define('vn-avatar', VnAvatar);
export { VnAvatar };
