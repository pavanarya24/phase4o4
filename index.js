/**
 * Serves the interactive chart at http://localhost:3000.
 *
 *   npm start
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;

const routes = {
  '/': { path: path.join(__dirname, 'public', 'index.html'), type: 'text/html; charset=utf-8' },
  '/p404.asset': { path: path.join(__dirname, 'assets', 'p404.asset'), type: 'application/octet-stream' },
  '/vela.global.min.js': { path: path.join(__dirname, 'node_modules', '@luxalgo', 'vela', 'dist', 'vela.global.min.js'), type: 'application/javascript' },
  '/vela-pinets.global.min.js': { path: path.join(__dirname, 'node_modules', '@luxalgo', 'vela-pinets', 'dist', 'vela-pinets.global.min.js'), type: 'application/javascript' },
};

http.createServer((req, res) => {
  const route = routes[req.url.split('?')[0]];
  if (!route || !fs.existsSync(route.path)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }
  res.writeHead(200, { 'Content-Type': route.type });
  fs.createReadStream(route.path).pipe(res);
}).listen(PORT, () => {
  console.log('PHASE 404 chart running at http://localhost:' + PORT + '  (Ctrl+C to stop)');
});
