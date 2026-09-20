const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
module.exports = function load(file, overrides = {}) {
 const full = path.resolve(file);
 const localRequire = createRequire(full);
 const compiled = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
 const module = { exports: {} };
 new Function('require','module','exports',compiled)((name) => {
  if (name in overrides) return overrides[name];
  if (name.startsWith('.')) {
   const target=path.resolve(path.dirname(full),name)+'.ts';
   if(fs.existsSync(target)) return load(target,overrides);
  }
  return localRequire(name);
 },module,module.exports);
 return module.exports;
};
