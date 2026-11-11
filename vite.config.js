import { defineConfig } from 'vite';

// While testing on a phone over Wi-Fi, the game posts errors and a heartbeat to /__log;
// they're printed in the dev server's output so problems on the phone can be seen on the laptop.
const phoneLog = {
  name: 'phone-log',
  configureServer(server) {
    server.middlewares.use('/__log', (req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        console.log(`[phone ${new Date().toLocaleTimeString()}] ${body}`);
        res.end('ok');
      });
    });
  },
};

// Relative paths, so the built game works from any folder (GitHub Pages serves it under /<repo>/).
export default defineConfig({ base: './', plugins: [phoneLog] });
