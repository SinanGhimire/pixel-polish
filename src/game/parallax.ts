/** Shared scale and bottom baseline preserve the relationship between exported layers. */
export function parallaxLayout(layers: number[][], viewportWidth: number, viewportHeight: number, floorHeight: number) {
  const artHeight = Math.max(1, ...layers.map((layer) => layer[1] ?? 1));
  const height = Math.max(1, viewportHeight - floorHeight);
  const scale = height / artHeight;
  return layers.map((layer) => ({ width: viewportWidth, height: (layer[1] ?? artHeight) * scale, y: height - (layer[1] ?? artHeight) * scale, scale }));
}

/** Adjacent mirrored copies share edge pixels, including non-seamless pack exports. */
export function repeatedLayerPositions(sourceWidth: number, scale: number, viewportWidth: number, scroll: number) {
  const width = sourceWidth * scale;
  if (width <= 0) return [];
  const first = Math.floor(scroll / width);
  const count = Math.ceil(viewportWidth / width) + 2;
  return Array.from({ length: count }, (_, i) => {
    const tile = first + i;
    return { x: tile * width - scroll, flipX: Math.abs(tile % 2) === 1 };
  });
}

/** The exported floor surface and the collision plane use the same world coordinate. */
export function floorBaseline(rows: number, tileSize: number, floorRows: number) {
  return (rows - floorRows) * tileSize;
}