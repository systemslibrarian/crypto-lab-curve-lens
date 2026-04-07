import '../styles/main.css';
import { initApp } from './ui';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('App root was not found.');
}

initApp(root);
