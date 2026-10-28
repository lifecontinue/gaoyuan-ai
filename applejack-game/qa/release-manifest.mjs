// Describe exact source/build files for GitHub's tree API without shell output truncation.
import fs from 'node:fs';
import crypto from 'node:crypto';
const files=[];
const append=(local,path)=>{
 const data=fs.readFileSync(local);
 const sha=crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${data.length}\0`),data])).digest('hex');
 const entry={local,path,size:data.length,sha};
 if(data.length<100000&&/\.(?:html|css|md|json|ts|tsx|mjs|py)$/.test(local)||local==='.gitignore')entry.content=data.toString('utf8');
 files.push(entry);
};
for(const folder of ['dist','src','public','tests']){
 for(const file of fs.readdirSync(folder,{recursive:true})){
  const local=folder+'/'+file;if(!fs.statSync(local).isFile())continue;
  append(local,folder==='dist'?'personal-brand-site/applejack-game/'+file:'applejack-game/'+local);
 }
}
for(const file of ['.gitignore','index.html','package.json','package-lock.json','tsconfig.json','vite.config.ts','README.md'])append(file,'applejack-game/'+file);
for(const file of fs.readdirSync('qa').filter(p=>/\.(py|mjs)$/.test(p)))append('qa/'+file,'applejack-game/qa/'+file);
append('README.md','personal-brand-site/applejack-game/README.md');
console.log(JSON.stringify(files));
