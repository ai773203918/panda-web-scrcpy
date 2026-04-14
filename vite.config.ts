import { defineConfig, Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import Markdown from './plugins/md-loader.js';
import Binary from './plugins/binary-loader.js';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    Markdown() as Plugin,
    Binary() as Plugin,
  ],
  base: '/PandaScrcpy/', // 须与 GitHub 仓库名一致（GitHub Pages 项目站点路径）
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});
