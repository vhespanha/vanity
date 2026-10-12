import type { ForgeConfig } from "../config.ts";
import type { Source } from "../sources.ts";
import { github } from "./github.ts";

/**
 * Forge plugins, selected by the FORGE setting. To add a forge, write a
 * function that turns a ForgeConfig into a Source and register it here.
 */
export const forges: Record<string, (config: ForgeConfig) => Source> = { github };
