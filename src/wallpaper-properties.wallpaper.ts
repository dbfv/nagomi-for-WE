// Wallpaper Engine build of the property bridge. The web build aliases this
// module away to wallpaper-properties.ts, which exports the same name as a
// no-op — see vite.wallpaper.config.ts.
//
// Why it exists: Wallpaper Engine withholds keyboard input from web wallpapers
// (by design, as an anti-keylogging measure), so the hex colour fields in the
// settings drawer can be focused but never typed into. Mouse input is forwarded
// normally, which means every other control already works inside the wallpaper;
// the colours are the only thing the page cannot ask for, so they are asked for
// through Wallpaper Engine's own properties dialog instead, whose declared
// schema lives in wallpaper/project.json.
//
// Wallpaper Engine hands a colour over as three space-separated sRGB floats in
// 0..1 ("1.0 0.1 0.25"), where the settings tree stores a colour either as a
// packed 0xrrggbb integer (the `color` node) or as a linear-space triple (the
// `rgb` node, matching THREE.Color's working space). Both conversions live here.
//
// applyUserProperties is called once with every property and thereafter only
// with the ones the user changed, so a property being present does not mean the
// user chose it: the first call also carries the defaults declared in
// project.json. Applying those blindly would stamp one colour over every koi
// family on the very first launch, so a value counts as a deliberate choice only
// when it differs from the declared default, or when it differs from the value
// last received for that property (which is what a change looks like).

import { definition } from "./settings/definition";
import { defaults as buildDefaults, nodeAt, type SettingPath } from "./settings/schema";
import { settings, type SettingsStore } from "./settings/store";

/** A colour property as Wallpaper Engine delivers it. */
interface WallpaperProperty {
  value?: unknown;
}

type WallpaperProperties = Record<string, WallpaperProperty | undefined>;

/** One user-facing colour, and every store path it writes. */
export interface WallpaperColorProperty {
  /** Property key, matching a key in wallpaper/project.json's properties. */
  key: string;
  label: string;
  /**
   * Paths to write, all of them given the same colour. The declared default is
   * read from the first one.
   */
  paths: readonly SettingPath[];
}

const koiFamilies = settings.live["koi-palettes"].length;

/** Every koi family is repainted together: one colour per koi feature. */
const everyFamily = (field: "base" | "accent" | "marking" | "fin"): SettingPath[] =>
  Array.from({ length: koiFamilies }, (_, index) => ["koi-palettes", index, field]);

export const WALLPAPER_COLOR_PROPERTIES: readonly WallpaperColorProperty[] = [
  { key: "deepWater", label: "Deep water", paths: [["pond-bed", "deepColor"]] },
  { key: "shallowWater", label: "Shallow water", paths: [["pond-bed", "shallowColor"]] },
  { key: "koiBody", label: "Koi body", paths: everyFamily("base") },
  { key: "koiAccent", label: "Koi patches", paths: everyFamily("accent") },
  { key: "koiMarking", label: "Koi markings", paths: everyFamily("marking") },
  { key: "koiFin", label: "Koi fins", paths: everyFamily("fin") },
];

type Triple = readonly [number, number, number];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** sRGB 0..1 to packed 0xrrggbb, the `color` node's representation. */
function packHex(srgb: Triple): number {
  const channel = (value: number): number => Math.round(clamp01(value) * 255);
  return (channel(srgb[0]) << 16) | (channel(srgb[1]) << 8) | channel(srgb[2]);
}

/** The transfer function three.js applies when it reads a hex colour. */
function srgbToLinear(value: number): number {
  const channel = clamp01(value);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** The inverse of srgbToLinear, used to state a linear default in sRGB. */
function linearToSrgb(value: number): number {
  const channel = clamp01(value);
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/**
 * "0.726 0.864 0.816" (Wallpaper Engine's colour format) as an sRGB triple.
 * Anything that is not exactly three finite numbers is refused rather than
 * guessed at.
 */
function parseWallpaperColor(raw: unknown): Triple | null {
  if (typeof raw !== "string") return null;
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  const channels = parts.map(Number);
  if (channels.some((channel) => !Number.isFinite(channel))) return null;
  return [clamp01(channels[0]), clamp01(channels[1]), clamp01(channels[2])];
}

// The schema leaf defaults are not the app's defaults everywhere: a koi family's
// colours come from the `koi-palettes` collection's own defaults list, and the
// leaf inside it is a white placeholder shared by all six families. Building the
// default tree the way the store does reads the palette list correctly.
const defaultSettings = buildDefaults(definition) as unknown;

/**
 * A colour's identity, at the resolution the app stores colours with: the hex
 * fields in the settings drawer write 8 bits per channel, so two colours within
 * a 255th of each other are the same colour here. Wallpaper Engine's own
 * precision is finer than that, and it need not re-serialise a value it was
 * given identically, so comparing the raw floats would report a colour the user
 * never touched as a choice.
 */
function colorKey(srgb: Triple): string {
  return srgb.map((channel) => Math.round(clamp01(channel) * 255)).join(" ");
}

/** Whether two colours in Wallpaper Engine's format are the same colour. */
export function sameWallpaperColor(left: string, right: string): boolean {
  const a = parseWallpaperColor(left);
  const b = parseWallpaperColor(right);
  return a !== null && b !== null && colorKey(a) === colorKey(b);
}

/** The colour this property falls back to, as sRGB, from the default tree. */
function declaredDefault(path: SettingPath): Triple {
  const value = readPath(defaultSettings, path);
  const node = nodeAt(definition, path);
  if (node?.kind === "color" && typeof value === "number") {
    return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
  }
  if (node?.kind === "rgb" && Array.isArray(value) && value.length === 3) {
    return value.map((channel) => linearToSrgb(Number(channel))) as unknown as Triple;
  }
  return [0, 0, 0];
}

/**
 * The same default in Wallpaper Engine's own format, which is what the value in
 * wallpaper/project.json has to be — a test asserts the two agree.
 */
export function declaredColorValue(property: WallpaperColorProperty): string {
  return declaredDefault(property.paths[0])
    .map((channel) => channel.toFixed(4))
    .join(" ");
}

function readPath(live: unknown, path: SettingPath): unknown {
  let current: unknown = live;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

/** Writes a colour in whichever representation the node at `path` uses. */
function writeColor(store: SettingsStore, path: SettingPath, srgb: Triple): void {
  const node = nodeAt(definition, path);
  const next =
    node?.kind === "color"
      ? packHex(srgb)
      : node?.kind === "rgb"
        ? srgb.map((channel) => Number(srgbToLinear(channel).toFixed(4)))
        : undefined;
  if (next === undefined) return;

  // Wallpaper Engine re-sends properties unchanged on some events; writing a
  // value the store already holds would only add an empty undo step.
  const current = readPath(store.live, path);
  if (Array.isArray(next) && Array.isArray(current)) {
    if (next.every((channel, index) => channel === current[index])) return;
  } else if (current === next) {
    return;
  }
  store.set(path, next);
}

/**
 * Builds the `applyUserProperties` handler. Returned rather than attached so a
 * test can drive it against its own store, with no browser globals involved.
 */
export function createWallpaperPropertyApplier(
  store: SettingsStore,
): (properties: WallpaperProperties) => void {
  const lastSeen = new Map<string, string>();

  return function applyUserProperties(properties: WallpaperProperties): void {
    if (!properties || typeof properties !== "object") return;

    for (const property of WALLPAPER_COLOR_PROPERTIES) {
      const incoming = properties[property.key];
      // A delta carries only the properties that changed.
      if (!incoming) continue;
      const srgb = parseWallpaperColor(incoming.value);
      if (!srgb) continue;

      const seen = colorKey(srgb);
      const previous = lastSeen.get(property.key);
      lastSeen.set(property.key, seen);

      const chosen =
        previous === undefined
          ? seen !== colorKey(declaredDefault(property.paths[0]))
          : previous !== seen;
      if (!chosen) continue;

      for (const path of property.paths) writeColor(store, path, srgb);
    }
  };
}

/**
 * Publishes the listener Wallpaper Engine looks for on the page. Call it once,
 * before the first render, after the persisted settings are loaded: a property
 * the user set in Wallpaper Engine's dialog outranks what localStorage holds.
 */
export function connectWallpaperProperties(): void {
  const applyUserProperties = createWallpaperPropertyApplier(settings);
  const target = window as unknown as {
    wallpaperPropertyListener?: Record<string, unknown>;
  };

  target.wallpaperPropertyListener = {
    ...target.wallpaperPropertyListener,
    applyUserProperties,
  };
}
