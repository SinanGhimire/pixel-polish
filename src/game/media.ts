const pointers = import.meta.glob<{ url: string }>("../assets/game/**/*.asset.json", { eager: true, import: "default" });
const registry: Record<string, string> = {};
for (const [path, asset] of Object.entries(pointers)) registry[path.replace("../assets/game/", "").replace(".asset.json", "")] = asset.url;

export function mediaUrl(path: string): string {
  const url = registry[path];
  if (!url) throw new Error(`Game asset is not registered: ${path}`);
  return url;
}