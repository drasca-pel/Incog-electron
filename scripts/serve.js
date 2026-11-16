// Zero-dependency local web server for the "src" folder:  npm run web   ->  http://localhost:5173
// Use it when you just want to edit and refresh in a browser (no Electron needed).
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'src'), port = process.env.PORT || 5173;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  });
}).listen(port, () => console.log('Incog Electric Lab: http://localhost:' + port + '  (Ctrl+C to stop)'));
