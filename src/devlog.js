// Testing aid, only on the dev server: sends errors, lost graphics and a heartbeat every 2 seconds
// to the laptop (see vite.config.js), so a freeze on a phone can be diagnosed.
// status(): a short line describing the game right now.
export function startDevLog(canvas, status) {
  const send = (msg) => fetch('/__log', { method: 'POST', body: msg, keepalive: true }).catch(() => {});
  addEventListener('error', (e) => send(`ERROR ${e.message} at ${e.filename}:${e.lineno}`));
  addEventListener('unhandledrejection', (e) => send(`REJECTION ${e.reason?.stack ?? e.reason}`));
  canvas.addEventListener('webglcontextlost', () => send('GRAPHICS LOST (webglcontextlost)'));
  canvas.addEventListener('webglcontextrestored', () => send('graphics restored'));
  document.addEventListener('visibilitychange', () => send(`page ${document.hidden ? 'hidden' : 'visible'}`));
  let frames = 0, slowest = 0;
  setInterval(() => {
    send(`beat ${frames / 2}fps slowest-frame ${slowest.toFixed(0)}ms ${status()}`);
    frames = 0;
    slowest = 0;
  }, 2000);
  send(`start ${navigator.userAgent} ${innerWidth}x${innerHeight}`);
  return {
    frame(ms) { frames++; slowest = Math.max(slowest, ms); },
    error(err) { send(`FRAME ERROR ${err.stack ?? err}`); },
  };
}
