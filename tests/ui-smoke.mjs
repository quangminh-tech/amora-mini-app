// Server rendering smoke check; this does not replace browser/phone acceptance.
import {build} from '../frontend/node_modules/esbuild/lib/main.js';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=await mkdtemp(join(tmpdir(),'amora-ui-'));const outfile=join(dir,'render.cjs');
const source=`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import App from './App';import {Badge} from './components/UI';import assert from 'node:assert/strict';globalThis.sessionStorage={getItem:()=>null};const html=renderToStaticMarkup(<App/>);assert(html.includes('Chào mừng trở lại'));assert(html.includes('Đăng nhập'));assert(html.includes('type="password"'));assert(!html.includes('CTV Hai'));assert(renderToStaticMarkup(<Badge value="completed"/>).includes('Hoàn tất'));console.log('PASS: React server-render smoke, login form and Vietnamese status labels.');`;
await build({stdin:{contents:source,loader:'tsx',resolveDir:join(root,'frontend/src')},bundle:true,platform:'node',format:'cjs',outfile,define:{'import.meta.env':'{}'},logLevel:'warning'});
await import(pathToFileURL(outfile));
