import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import monacoEditorPlugin from "vite-plugin-monaco-editor";
import path from "path";
import fs from "fs";

// vite-plugin-monaco-editor injeta um <script> inline (self["MonacoEnvironment"]
// = ...) direto no <head>, sem opção pra desligar isso. A CSP de produção não
// libera 'unsafe-inline' pra scripts (ver electron/main.ts), então esse script
// era bloqueado silenciosamente e o Monaco nunca terminava de inicializar.
// Em vez de afrouxar a CSP, extrai o conteúdo pro mesmo tratamento que
// bootstrap.js já recebe: um arquivo externo, servido por 'self'.
//
// Escreve o arquivo direto no disco dentro do próprio handler (em vez de
// this.emitFile em generateBundle) porque a ordem dos hooks generateBundle
// entre plugins segue a ordem de registro em `plugins`, e não a ordem 'post'
// dos hooks transformIndexHtml — o generateBundle do vite:build-html (que
// de fato dispara este transformIndexHtml) roda DEPOIS do nosso, então
// emitFile ali sempre viu o conteúdo ainda não extraído.
function externalizeMonacoEnv(): Plugin {
  let outDir = "dist";
  return {
    name: "externalize-monaco-env",
    apply: "build",
    configResolved(config) {
      outDir = path.isAbsolute(config.build.outDir)
        ? config.build.outDir
        : path.join(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const match = html.match(
          /<script>(self\["MonacoEnvironment"\][\s\S]*?)<\/script>\s*/,
        );
        if (!match) return html;
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, "monaco-env.js"), match[1]);
        return html.replace(
          match[0],
          '<script src="./monaco-env.js"></script>\n    ',
        );
      },
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    (monacoEditorPlugin as any)({
      languageWorkers: [
        "editorWorkerService",
        "typescript",
        "json",
        "css",
        "html",
      ],
    }),
    externalizeMonacoEnv(),
    electron([
      {
        entry: "electron/main.ts",
      },
      {
        entry: "electron/preload.ts",
        onstart(options) {
          options.reload();
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
  },
});
