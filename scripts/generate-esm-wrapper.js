const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const esmDir = path.join(distDir, 'esm');
fs.mkdirSync(esmDir, { recursive: true });

const cjsEntry = require(path.join(distDir, 'index.js'));
const exportKeys = Object.keys(cjsEntry).filter((k) => k !== 'default' && k !== '__esModule');

const esmLines = [
  "import cjsModule from '../index.js';",
  '',
  ...exportKeys.map((key) => `export const ${key} = cjsModule.${key};`),
  '',
  'export default cjsModule;',
  ''
];

fs.writeFileSync(path.join(esmDir, 'index.mjs'), esmLines.join('\n'), 'utf-8');
fs.writeFileSync(
  path.join(esmDir, 'index.d.mts'),
  "export * from '../index.js';\nexport { default } from '../index.js';\n",
  'utf-8'
);
