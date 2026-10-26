#!/usr/bin/env node
// Offline input, no API requests, no database writes. NEVER publish during prelaunch.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSitemap } from './seo/sitemap-values.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=Object.fromEntries(process.argv.slice(2).map(v=>{
 const m=/^--([a-z-]+)=(.+)$/.exec(v); if(!m)throw new Error('Use --origin=https://your-domain --source=path-to-approved-catalog.json [--write=approved]');return [m[1],m[2]];
}));
try {
 if(!args.origin||!args.source) {
   console.log('SITEMAP PREPARATION ONLY: no domain or approved product export supplied.');
   console.log('No file generated. Wait for the owner domain, published products and go-live approval.');
 } else {
   const source=JSON.parse(readFileSync(resolve(process.cwd(),args.source),'utf8'));
   const xml=buildSitemap({origin:args.origin,products:source.products,categories:source.categories});
   const count=(xml.match(/<loc>/g)||[]).length;
   console.log(`Sitemap preview: ${count} localized URLs. No private pages or draft products included.`);
   if(args.write) {
     if(args.write!=='approved')throw new Error('Write requires --write=approved.');
     const html=readFileSync(resolve(root,'client/index.html'),'utf8');
     const headers=readFileSync(resolve(root,'client/public/_headers'),'utf8');
     if(/name=["']robots["']\s+content=["']noindex/i.test(html)||/^\/\*\s*\n\s*X-Robots-Tag:\s*noindex/im.test(headers))
       throw new Error('Indexing is still locked by prelaunch HTML/headers. Sitemap will NOT be written.');
     writeFileSync(resolve(root,'client/public/sitemap.xml'),xml,'utf8');
     console.log('Approved sitemap written. Regenerate after every approved published catalog change.');
   }
 }
} catch(error){console.error(error.message);process.exitCode=1;}
