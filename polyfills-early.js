(function () {
  var g = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this);
  function ensure(name, factory) {
    if (typeof g[name] === 'undefined') {
      var v = factory();
      try { g[name] = v; } catch (_) {}
      if (typeof global !== 'undefined' && typeof global[name] === 'undefined') {
        try { global[name] = v; } catch (_) {}
      }
    }
  }
  ensure('DOMException', function () {
    var DOMException = function (message, name) {
      var err = new Error(message);
      err.name = name || 'Error';
      err.code = 0;
      return err;
    };
    DOMException.prototype = Object.create(Error.prototype);
    return DOMException;
  });
  ensure('structuredClone', function () { return function (v) { return JSON.parse(JSON.stringify(v)); }; });
  ensure('queueMicrotask', function () { return function (cb) { Promise.resolve().then(cb); }; });
  console.log('[ComeBack] Early polyfills applied');
})();
