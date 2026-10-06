import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Los navegadores bloquean los <script type="module"> abiertos desde file://
 * (doble clic en dist/index.html). Como el bundle se genera en formato IIFE,
 * podemos cargarlo como script clásico: quitamos type="module" y crossorigin
 * (que en file:// también provoca un bloqueo CORS) y añadimos defer para que
 * se ejecute cuando el HTML ya está cargado.
 */
function classicScriptForFileProtocol(): Plugin {
  const stripCrossorigin = (attributes: string) => attributes.replace(/\s*crossorigin(="[^"]*")?/g, '');

  return {
    name: 'infrapulse:classic-script',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html
          .replace(
            /<script([^>]*?)\s+type="module"([^>]*)><\/script>/g,
            (_match, before: string, after: string) => `<script defer${stripCrossorigin(before + after)}></script>`,
          )
          .replace(/<link([^>]*?)rel="stylesheet"([^>]*?)>/g, (match, before: string, after: string) =>
            match.includes('./assets/') ? `<link${stripCrossorigin(before)}rel="stylesheet"${stripCrossorigin(after)}>` : match,
          ),
    },
  };
}

export default defineConfig({
  // Rutas relativas: la demo funciona desde cualquier subcarpeta y desde file://.
  base: './',
  plugins: [react(), classicScriptForFileProtocol()],
  build: {
    // Sin el polyfill de modulepreload: no hay chunks que precargar.
    modulePreload: false,
    // Con salida IIFE, Vite inyectaría el CSS desde el JS (pantalla sin estilos
    // hasta que carga el script). Así se emite un único .css enlazado en el HTML.
    cssCodeSplit: false,
    // Vite 8 usa Rolldown: `rolldownOptions` sustituye a `rollupOptions` y
    // `codeSplitting: false` equivale al antiguo `inlineDynamicImports: true`.
    rolldownOptions: {
      output: {
        format: 'iife',
        codeSplitting: false,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
