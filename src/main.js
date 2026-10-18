/**
 * Application Entry Point
 */
import './styles/main.css';
import { App } from './App.js';

document.addEventListener('DOMContentLoaded', async () => {
  const app = new App();
  window.__app = app;
  await app.init();
});
