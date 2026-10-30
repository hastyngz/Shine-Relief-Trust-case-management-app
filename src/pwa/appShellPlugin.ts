import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Emits the offline app shell: a versioned service worker (/sw.js) that
 * precaches the built HTML, JS, CSS and logos, plus the web app manifest.
 *
 * The service worker never caches /api/*, Firebase traffic or storage download
 * URLs; see src/pwa/sw-template.js.
 */

const MANIFEST_FILENAME = 'manifest.webmanifest';
const SW_FILENAME = 'sw.js';

/** Logos that are referenced by the manifest and the app shell. */
const SHELL_LOGOS = [
  '/shine-logo.png',
  '/shine-logo-white.png',
  '/new-shine-logo-transparent.png',
];

function listBuiltAssets(distDir: string): string[] {
  const assetsDir = join(distDir, 'assets');
  if (!existsSync(assetsDir)) return [];
  return readdirSync(assetsDir)
    .filter((name) => /\.(js|css|woff2?|png|svg)$/.test(name))
    .map((name) => `/assets/${name}`);
}

export function appShellPlugin(): Plugin {
  return {
    name: 'shine-app-shell',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'link',
          attrs: { rel: 'manifest', href: `/${MANIFEST_FILENAME}` },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#0f766e' },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { name: 'apple-mobile-web-app-title', content: 'SHINE Case Management' },
          injectTo: 'head',
        },
      ];
    },
    closeBundle() {
      const distDir = join(process.cwd(), 'dist');
      if (!existsSync(distDir)) return;

      const version = Date.now().toString(36);
      const precache = ['/index.html', ...SHELL_LOGOS, ...listBuiltAssets(distDir)];

      const template = readFileSync(join(process.cwd(), 'src/pwa/sw-template.js'), 'utf8');
      const serviceWorker = template
        .replaceAll('%VERSION%', version)
        .replace('%PRECACHE%', JSON.stringify(precache, null, 2));
      writeFileSync(join(distDir, SW_FILENAME), serviceWorker);
    },
  };
}
