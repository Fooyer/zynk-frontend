import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import path from 'path';
import fs from 'fs';

// vite-plugin-monaco-editor injeta um <script> inline no <head> pra
// configurar o MonacoEnvironment antes do bundle carregar. Em build de
// produção a CSP do Electron não libera 'unsafe-inline' pra scripts (de
// propósito — habilitar isso abriria uma classe inteira de XSS), então esse
// script inline específico era bloqueado sempre, silenciosamente. Aqui ele
// é extraído pra um arquivo externo (que 'self' já libera) depois que o
// plugin do Monaco o injeta, sem precisar de nenhum passo de build manual.
function externalizeMonacoInlineScript(): Plugin {
  let extracted: string | null = null;

  return {
    name: 'externalize-monaco-inline-script',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const match = html.match(/<script>(self\["MonacoEnvironment"\][\s\S]*?)<\/script>\s*/);
        if (!match) return html;
        extracted = match[1];
        return html.replace(match[0], '<script src="./monaco-env.js"></script>\n    ');
      },
    },
    writeBundle(options) {
      if (!extracted || !options.dir) return;
      fs.writeFileSync(path.join(options.dir, 'monaco-env.js'), extracted, 'utf-8');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    (monacoEditorPlugin as any)({
      languageWorkers: ['editorWorkerService', 'typescript', 'json', 'css', 'html'],
    }),
    externalizeMonacoInlineScript(),
    electron([
      {
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
  },
});
