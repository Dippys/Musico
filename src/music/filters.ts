import type { FilterOptions } from "shoukaku";

export const filterPresets = [
  "off",
  "bassboost",
  "nightcore",
  "vaporwave",
  "karaoke",
] as const;

export type FilterPreset = (typeof filterPresets)[number];

const filterPresetOptions: Record<Exclude<FilterPreset, "off">, FilterOptions> = {
  bassboost: {
    equalizer: [
      { band: 0, gain: 0.2 },
      { band: 1, gain: 0.15 },
      { band: 2, gain: 0.1 },
    ],
  },
  karaoke: {
    karaoke: {
      filterBand: 220,
      filterWidth: 100,
      level: 1,
      monoLevel: 1,
    },
  },
  nightcore: {
    timescale: {
      pitch: 1.2,
      rate: 1.0,
      speed: 1.12,
    },
  },
  vaporwave: {
    timescale: {
      pitch: 0.9,
      rate: 1.0,
      speed: 0.85,
    },
  },
};

export const getFiltersForPreset = (preset: FilterPreset): FilterOptions => {
  if (preset === "off") {
    return {};
  }

  return filterPresetOptions[preset];
};

export const formatFilterPresetLabel = (preset: FilterPreset): string => {
  switch (preset) {
    case "bassboost":
      return "bass boost";
    case "nightcore":
      return "nightcore";
    case "vaporwave":
      return "vaporwave";
    case "karaoke":
      return "karaoke";
    default:
      return "off";
  }
};