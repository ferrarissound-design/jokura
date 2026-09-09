const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
http.createServer((req,res)=>{
 const file=path.resolve('.','.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
 if(!file.startsWith(process.cwd()+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);});
}).listen(4173,'127.0.0.1');
