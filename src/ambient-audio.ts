// Source of the ambient river loop for the web build: the file lives in public/
// and is served from the site root.
//
// The Wallpaper Engine build cannot fetch() from the local disk, so it aliases
// this module to ambient-audio.wallpaper.ts, which inlines the loop as a data:
// URI instead. Keep the exported name in sync between the two files (the alias
// is wired up in vite.wallpaper.config.ts).
export const AMBIENT_AUDIO_URL = `${import.meta.env.BASE_URL}audio/ambient-river-v1.m4a`;
