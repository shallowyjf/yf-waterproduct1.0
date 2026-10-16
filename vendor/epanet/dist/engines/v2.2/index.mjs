import _EpanetEngine from './_engine.mjs';
const _wasmUrl = new URL('./EpanetEngine.wasm', import.meta.url);
export function EpanetEngine(opts) {
  const { locateFile: _locateFile, ...rest } = opts || {};
  return _EpanetEngine({
    locateFile: _locateFile || (path => path === 'EpanetEngine.wasm' ? _wasmUrl.toString() : path),
    ...rest
  });
}
export default EpanetEngine;
