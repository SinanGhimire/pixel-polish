import { describe, expect, it } from "vitest";
import { parallaxLayout } from "./parallax";
import { MAPS } from "./config";
import { mediaUrl } from "./media";

describe("Integrated map assets", () => {
  it("has registered floors and every background and prop for all areas", () => {
    expect(MAPS.length).toBe(44);
    for (const map of MAPS) {
      expect(mediaUrl(`maps/${map.id}/ground.png`)).toContain("/__l5e/assets-v1/");
      map.layers.forEach((_, i) => expect(mediaUrl(`maps/${map.id}/bg${i}.png`)).toContain("/__l5e/assets-v1/"));
      map.props.forEach((_, i) => expect(mediaUrl(`maps/${map.id}/props/${i}.png`)).toContain("/__l5e/assets-v1/"));
    }
  });
  it("keeps every layer on the same scale and floor baseline", () => {
    for (const map of MAPS) for (const width of [300, 640, 900]) {
      const layers = parallaxLayout(map.layers, width, 225, 32);
      for (const layer of layers) {
        expect(layer.y + layer.height).toBeCloseTo(193);
        expect(layer.scale).toBe(layers[0]?.scale);
        expect(layer.width).toBe(width);
      }
    }
  });
});