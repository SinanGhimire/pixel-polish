/** Shared scale and bottom baseline preserve the relationship between exported layers. */
export function parallaxLayout(layers: number[][], viewportWidth: number, viewportHeight: number, floorHeight: number) {
  const artHeight = Math.max(1, ...layers.map((layer) => layer[1] ?? 1));
  const height = Math.max(1, viewportHeight - floorHeight);
  const scale = height / artHeight;
  return layers.map((layer) => ({ width: viewportWidth, height: (layer[1] ?? artHeight) * scale, y: height - (layer[1] ?? artHeight) * scale, scale }));
}