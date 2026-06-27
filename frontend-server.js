const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 3001);
const root = path.join(__dirname, 'frontend');

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain'
};

http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;
  const safeUrl = url.split('?')[0].split('#')[0];
  const filePath = path.join(root, path.normalize(safeUrl));

  if (!filePath.startsWith(root)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad request');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(port, () => {
  console.log(`Frontend server running at http://127.0.0.1:${port}`);
});
