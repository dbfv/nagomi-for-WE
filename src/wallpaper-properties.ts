// Web build of the Wallpaper Engine property bridge. The real implementation
// lives in wallpaper-properties.wallpaper.ts, which vite.wallpaper.config.ts
// aliases in for the wallpaper bundle.
//
// The deployed site has a keyboard, so its colours are typed into the settings
// drawer directly and there is nothing to bridge: this module is deliberately
// inert. Inside Wallpaper Engine the same fields cannot be typed into at all,
// and the wallpaper build reads the colours from Wallpaper Engine's own
// properties dialog instead.
export function connectWallpaperProperties(): void {
  // Nothing to connect to outside Wallpaper Engine.
}
