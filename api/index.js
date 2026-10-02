// Vercel's Node.js runtime accepts an HTTP server, including WebSocket upgrades.
// Keep REST and Socket.IO on the same server and use a shared adapter on Vercel.
export { default } from '../src/server.js';
