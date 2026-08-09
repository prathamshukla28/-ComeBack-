const g = globalThis;

if (typeof g.DOMException === 'undefined') {
  class DOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name || 'Error';
      this.code = 0;
    }
  }
  g.DOMException = DOMException;
}

if (typeof g.structuredClone === 'undefined') {
  g.structuredClone = (v) => JSON.parse(JSON.stringify(v));
}

if (typeof g.queueMicrotask === 'undefined') {
  g.queueMicrotask = (cb) => Promise.resolve().then(cb);
}

require('expo-router/entry');
