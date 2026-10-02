// Replaces the old public entry point. It must never import legacy routes.
// npm start uses src/server.js; Vercel uses api/index.js.
export { default } from './src/server.js';
