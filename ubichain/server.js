const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Listen on all interfaces so other devices can connect
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Paths to SSL certificates
const keyPath = path.join(__dirname, 'localhost-key.pem');
const certPath = path.join(__dirname, 'localhost.pem');

// Check if certificates exist
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error('❌ SSL certificates not found!');
  console.error('   Please run: node setup-https.js');
  console.error('   Or: bash setup-https.sh');
  process.exit(1);
}

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on https://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}`);
    console.log(`> Access from other devices: https://<your-local-ip>:${port}`);
    console.log(`> Find your local IP with: ifconfig (Mac/Linux) or ipconfig (Windows)`);
  });
});

