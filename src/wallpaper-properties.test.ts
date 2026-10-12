import { describe, expect, it } from "vitest";
import projectSource from "../wallpaper/project.json?raw";
import { SettingsStore, settings } from "./settings/store";
import {
  WALLPAPER_COLOR_PROPERTIES,
  connectWallpaperProperties,
  createWallpaperPropertyApplier,
  declaredColorValue,
  sameWallpaperColor,
} from "./wallpaper-properties.wallpaper";

// Read as text rather than importing: the JSON is a Wallpaper Engine artifact
// shipped next to index.html, not part of the TypeScript project.
const project = JSON.parse(projectSource) as {
  type: string;
  file: string;
  general: { properties: Record<string, { type: string; text: string; value: string }> };
};

const properties = project.general.properties;

/** What Wallpaper Engine sends on its first call: every property, with whatever
 *  value is current for it. */
function fullSet(overrides: Record<string, string> = {}): Record<string, { value: string }> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, property]) => [
      key,
      { value: overrides[key] ?? property.value },
    ]),
  );
}

describe("wallpaper/project.json", () => {
  it("declares exactly the properties the bridge reads", () => {
    expect(Object.keys(properties).sort()).toEqual(
      WALLPAPER_COLOR_PROPERTIES.map((property) => property.key).sort(),
    );
  });

  it("declares each property as the colour and label the bridge expects", () => {
    for (const property of WALLPAPER_COLOR_PROPERTIES) {
      const declared = properties[property.key];
      expect(declared.type).toBe("color");
      expect(declared.text).toBe(property.label);
      // The declared default has to read as the app's own default, or Wallpaper
      // Engine's very first call would look like a colour the user chose.
      expect(sameWallpaperColor(declared.value, declaredColorValue(property))).toBe(true);
    }
  });
});

describe("wallpaper properties", () => {
  it("leaves the pond alone when Wallpaper Engine only reports its own defaults", () => {
    const store = new SettingsStore();
    const before = JSON.stringify(store.live);
    createWallpaperPropertyApplier(store)(fullSet());
    expect(JSON.stringify(store.live)).toBe(before);
  });

  it("repaints every koi family when one colour is chosen", () => {
    const store = new SettingsStore();
    createWallpaperPropertyApplier(store)(fullSet({ koiBody: "1 0 0" }));
    for (const family of store.live["koi-palettes"]) expect(family.base).toBe(0xff0000);
  });

  it("applies a colour changed in Wallpaper Engine's dialog", () => {
    const store = new SettingsStore();
    const apply = createWallpaperPropertyApplier(store);
    apply(fullSet());
    apply({ koiAccent: { value: "0 0 1" } });
    for (const family of store.live["koi-palettes"]) expect(family.accent).toBe(0x0000ff);
  });

  it("applies a colour set back to the declared default", () => {
    const store = new SettingsStore();
    const apply = createWallpaperPropertyApplier(store);
    apply(fullSet({ koiFin: "0 0 0" }));
    for (const family of store.live["koi-palettes"]) expect(family.fin).toBe(0x000000);

    apply({ koiFin: { value: properties.koiFin.value } });
    for (const family of store.live["koi-palettes"]) expect(family.fin).not.toBe(0x000000);
  });

  it("ignores a full set repeated with unchanged values", () => {
    const store = new SettingsStore();
    const apply = createWallpaperPropertyApplier(store);
    const set = fullSet({ deepWater: "1 0 0" });
    apply(set);
    const applied = JSON.stringify(store.live);
    apply(set);
    expect(JSON.stringify(store.live)).toBe(applied);
  });

  it("converts Wallpaper Engine's sRGB colour into the store's linear water colour", () => {
    const store = new SettingsStore();
    createWallpaperPropertyApplier(store)(fullSet({ deepWater: "0.5 0.5 0.5" }));
    expect(store.live["pond-bed"].deepColor).toEqual([0.214, 0.214, 0.214]);
  });

  it("refuses values that are not three numbers", () => {
    const store = new SettingsStore();
    const before = JSON.stringify(store.live);
    const apply = createWallpaperPropertyApplier(store);
    apply({ deepWater: { value: "salmon" } });
    apply({ deepWater: { value: "1 2" } });
    apply({ deepWater: { value: "1 2 3 4" } });
    apply({ deepWater: {} });
    apply({ deepWater: { value: 7 } });
    expect(JSON.stringify(store.live)).toBe(before);
  });
});

// The listener name and the method name are Wallpaper Engine's contract, and
// nothing checks them at build time: if either is wrong the wallpaper simply
// never hears about a colour. This exercises the wiring the wallpaper entry
// point calls, on the singleton store it writes to. Last, because it mutates it.
describe("the listener Wallpaper Engine looks for", () => {
  it("publishes applyUserProperties on window and applies a chosen colour", () => {
    const globals = globalThis as unknown as { window?: unknown };
    globals.window ??= {};

    connectWallpaperProperties();

    const listener = (
      globals.window as {
        wallpaperPropertyListener?: {
          applyUserProperties?: (properties: Record<string, { value: string }>) => void;
        };
      }
    ).wallpaperPropertyListener;

    expect(typeof listener?.applyUserProperties).toBe("function");
    // Optional because the type above is: the assertion just checked it exists.
    listener?.applyUserProperties?.(fullSet({ koiMarking: "0 0 1" }));
    for (const family of settings.live["koi-palettes"]) expect(family.marking).toBe(0x0000ff);
  });
});
