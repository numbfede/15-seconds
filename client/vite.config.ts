import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  return {
    root: rootDir,
    publicDir: path.join(rootDir, 'public'),
    envDir: repoRoot,
    resolve: {
      alias: {
        '@15-seconds/shared': path.resolve(repoRoot, 'shared/src/index.ts'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
    define: {
      'import.meta.env.VITE_SERVER_URL': JSON.stringify(
        env.VITE_SERVER_URL ?? process.env.VITE_SERVER_URL ?? '',
      ),
    },
  };
});
