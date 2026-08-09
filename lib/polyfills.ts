// Runs AFTER React Native's InitializeCore, so globals like AbortController exist.
// Imported at the very top of app/_layout.tsx.

const g = globalThis as any;

function patchAbortSignal() {
  if (typeof g.AbortController !== 'function' || typeof g.AbortSignal !== 'function') return;
  const proto = g.AbortSignal.prototype;
  if (typeof proto.addEventListener === 'function') return;

  const LKEY = '__cbAbortListeners__';
  proto.addEventListener = function (type: string, listener: any) {
    if (!this[LKEY]) this[LKEY] = {};
    if (!this[LKEY][type]) this[LKEY][type] = [];
    this[LKEY][type].push(listener);
  };
  proto.removeEventListener = function (type: string, listener: any) {
    if (!this[LKEY] || !this[LKEY][type]) return;
    this[LKEY][type] = this[LKEY][type].filter((l: any) => l !== listener);
  };
  proto.dispatchEvent = function (event: any) {
    const arr = this[LKEY] && this[LKEY][event.type];
    if (arr) arr.slice().forEach((l: any) => { try { l.call(this, event); } catch (e) { console.warn(e); } });
    if (event.type === 'abort' && typeof (this as any).onabort === 'function') {
      try { (this as any).onabort.call(this, event); } catch (e) { console.warn(e); }
    }
    return true;
  };
  if (typeof proto.throwIfAborted !== 'function') {
    proto.throwIfAborted = function () {
      if ((this as any).aborted) throw (this as any).reason || new Error('Aborted');
    };
  }
  const acProto = g.AbortController.prototype;
  const origAbort = acProto.abort;
  acProto.abort = function (reason?: any) {
    const sig = (this as any).signal;
    origAbort.call(this, reason);
    try { sig.dispatchEvent({ type: 'abort', target: sig }); } catch {}
  };
  console.log('[ComeBack] AbortSignal patched');
}

patchAbortSignal();
