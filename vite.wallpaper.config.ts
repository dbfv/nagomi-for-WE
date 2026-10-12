import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const projectRoot = import.meta.dirname;

const attr = (attrs: string, name: string): string | undefined =>
  new RegExp(`\\b${name}="([^"]+)"`).exec(attrs)?.[1];

/**
 * Collapses the build into a single self-contained index.html.
 *
 * Wallpaper Engine renders web wallpapers from file://, and Chromium refuses
 * both things a normal build emits there: an external
 * `<script type="module" src="...">` (a module script is always a CORS request,
 * and file:// has origin "null") and any `/assets/...` path, which resolves
 * against the drive root rather than the page. The entry script, the stylesheet
 * and every asset are inlined instead, leaving a page that requests nothing.
 */
function selfContainedHtml(): Plugin {
  let outDir = "";
  let publicDir = "";

  return {
    name: "nagomi:self-contained-html",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
      publicDir = config.publicDir;
    },
    // Runs against the written output instead of the bundle: mutating the
    // bundle's chunks makes Vite re-attach its HTML entry module to the entry
    // chunk, which drags a dead copy of index.html into the JS.
    closeBundle() {
      const htmlPath = path.join(outDir, "index.html");
      if (!fs.existsSync(htmlPath)) return;

      const consumed = new Set<string>();
      const unresolved: string[] = [];

      const readAsset = (url: string): string | null => {
        const relative = url.replace(/^(?:\.\/|\/)/, "");
        const file = [path.join(outDir, relative), path.join(publicDir, relative)].find(
          (candidate) => fs.existsSync(candidate),
        );
        if (!file) return null;
        consumed.add(file);
        return fs.readFileSync(file, "utf8");
      };

      // A single pass, so nothing it injects is rescanned: the inlined bundles
      // legitimately contain "<script src=..." and "<link href=..." strings.
      // Scripts here are only the src-carrying (empty) ones; the JSON-LD block
      // has a body and is deliberately left alone.
      const html = fs
        .readFileSync(htmlPath, "utf8")
        .replace(
          /<script\b([^>]*)><\/script>|<link\b([^>]*)>/g,
          (tag, scriptAttrs: string | undefined, linkAttrs: string | undefined) => {
            const isScript = scriptAttrs !== undefined;
            const attrs = scriptAttrs ?? linkAttrs ?? "";
            // A wallpaper has no browser chrome, no SEO surface and nothing to
            // preload: only the stylesheet is worth keeping.
            if (/\brel="(?!stylesheet)/.test(attrs)) return "";

            const url = attr(attrs, isScript ? "src" : "href");
            if (!url) return tag;
            const source = readAsset(url);
            if (source === null) {
              unresolved.push(`<${isScript ? "script" : "link"} … ${url}>`);
              return tag;
            }
            if (!isScript) return `<style>${source}</style>`;
            // A literal "</script>" in the bundle would close the tag early;
            // "<\/script>" is identical to it in every JS context a bundle can
            // contain (string, template or regex literal).
            return `<script type="module">${source.replace(/<\/script/gi, "<\\/script")}</script>`;
          },
        );

      if (unresolved.length > 0) {
        throw new Error(
          `dist-wallpaper/index.html still points at ${unresolved.length} file(s) that are ` +
            `not inlined and would not resolve under file://:\n  ${unresolved.join("\n  ")}`,
        );
      }

      fs.writeFileSync(htmlPath, html);
      for (const file of consumed) fs.rmSync(file, { force: true });
      try {
        fs.rmdirSync(path.join(outDir, "assets"));
      } catch {
        // Absent or not empty: anything left is reported by the check below.
      }

      // The whole point of this build is one file. A second one means an asset
      // slipped past assetsInlineLimit or the app grew a dynamic import, either
      // of which would silently fail to load in Wallpaper Engine.
      const strays = fs
        .readdirSync(outDir)
        .filter((entry) => entry !== "index.html")
        .concat(
          fs.existsSync(path.join(outDir, "assets"))
            ? fs.readdirSync(path.join(outDir, "assets")).map((entry) => `assets/${entry}`)
            : [],
        );
      if (strays.length > 0) {
        throw new Error(
          `dist-wallpaper must be a single self-contained index.html, but it also contains:\n  ` +
            `${strays.join("\n  ")}\n` +
            `Raise build.assetsInlineLimit if an asset was emitted instead of inlined.`,
        );
      }
    },
  };
}

// Wallpaper Engine build. Run `pnpm build:wallpaper`, then drag the generated
// dist-wallpaper/index.html onto Wallpaper Engine's "Create Wallpaper" button.
export default defineConfig({
  base: "./",
  // dist-wallpaper must hold nothing but index.html, so the public/ files (the
  // m4a source, the social image, the sitemap) stay out of it.
  publicDir: false,
  plugins: [react(), tailwindcss(), selfContainedHtml()],
  resolve: {
    alias: [
      // Swap in the bundled, inlined Ogg Opus. Must precede the generic "@"
      // entry below: the first matching alias wins.
      {
        find: "@/ambient-audio",
        replacement: path.resolve(projectRoot, "src/ambient-audio.wallpaper.ts"),
      },
      { find: "@", replacement: path.resolve(projectRoot, "src") },
    ],
  },
  build: {
    outDir: "dist-wallpaper",
    emptyOutDir: true,
    // Comfortably above the largest asset here (the ~290 kB ambient loop, once
    // base64-encoded), but low enough that a genuinely large asset is emitted as
    // a file and caught by the single-file check rather than inlined.
    assetsInlineLimit: 2 * 1024 * 1024,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    // Conservative floor: Wallpaper Engine ships its own CEF build, which can
    // trail the Chromium that the web deploy targets.
    target: "chrome104",
  },
});
