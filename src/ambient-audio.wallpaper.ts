// Wallpaper Engine build of the ambient loop (see ambient-audio.ts).
//
// Wallpaper Engine renders web wallpapers from file://, where fetch() rejects
// local paths outright ("URL scheme file is not supported") and its CEF build
// cannot be relied on for the m4a/AAC source. Importing the Ogg Opus file lets
// Vite inline it as a data: URI, which fetch() accepts on any origin.
import ambientRiverUrl from "./assets/ambient-river-v1.ogg";

export const AMBIENT_AUDIO_URL = ambientRiverUrl;
