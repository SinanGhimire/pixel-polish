import { createClientOnlyFn } from "@tanstack/react-start";

/** Strip the browser engine and scene imports from the server bundle. */
export const loadBrowserEngine = createClientOnlyFn(async () => {
  const [engine, scene] = await Promise.all([import("phaser"), import("./ArenaScene")]);
  return { Phaser: engine.default, ArenaScene: scene.ArenaScene };
});