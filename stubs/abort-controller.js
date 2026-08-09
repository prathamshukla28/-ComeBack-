'use strict';

// AbortSignal that implements addEventListener (Hermes' native version lacks it)
class AbortSignalStub {
  constructor() {
    this.aborted = false;
    this.reason = undefined;
    this.onabort = null;
    this._listeners = { abort: new Set() };
  }
  addEventListener(type, listener) {
    if (!this._listeners[type]) this._listeners[type] = new Set();
    this._listeners[type].add(listener);
  }
  removeEventListener(type, listener) {
    if (this._listeners[type]) this._listeners[type].delete(listener);
  }
  dispatchEvent(event) {
    const set = this._listeners[event.type];
    if (set) set.forEach((l) => { try { l.call(this, event); } catch (e) { console.warn(e); } });
    if (event.type === 'abort' && typeof this.onabort === 'function') {
      try { this.onabort.call(this, event); } catch (e) { console.warn(e); }
    }
    return true;
  }
  throwIfAborted() {
    if (this.aborted) {
      const err = this.reason || new Error('Aborted');
      throw err;
    }
  }
}

class AbortControllerStub {
  constructor() {
    this.signal = new AbortSignalStub();
  }
  abort(reason) {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.reason = reason !== undefined ? reason : new Error('Aborted');
    this.signal.dispatchEvent({ type: 'abort', target: this.signal });
  }
}

module.exports = {
  AbortController: AbortControllerStub,
  AbortSignal: AbortSignalStub,
  default: AbortControllerStub,
};
