/**
 * scene-system -- reference implementation
 *
 * Provides ScenePack validation and deterministic ScenePlan resolution described in:
 * `packages/scene-system/product_spec.md`
 * `packages/scene-system/tech_spec.md`
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCENE_PACK_SCHEMA_URL = new URL("../schemas/scene_pack.schema.json", import.meta.url);

/**
 * @typedef {Object} ScenePack
 * @property {string} scene_pack_id
 * @property {string} version
 * @property {ScenePreset[]} presets
 */

/**
 * @typedef {Object} ScenePreset
 * @property {string} preset_id
 * @property {string} title
 * @property {string[]=} tags
 * @property {Object=} defaults
 * @property {{ positive: string, negative: string, style_prompt?: string }} prompt_recipe
 * @property {string[]=} reference_image_refs
 * @property {Object=} constraints
 */

/**
 * @typedef {Object} ScenePlan
 * @property {string} scene_pack_id
 * @property {string} version
 * @property {string} preset_id
 * @property {number} seed
 * @property {Object} prompt
 * @property {Object} defaults
 * @property {Object} constraints
 * @property {Object} output
 */

/** @returns {string} */
export function readScenePackSchemaText() {
  return readFileSync(fileURLToPath(SCENE_PACK_SCHEMA_URL), "utf8");
}

/** @returns {any} */
export function readScenePackSchemaJson() {
  return JSON.parse(readScenePackSchemaText());
}

/**
 * @param {any} pack
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateScenePack(pack) {
  /** @type {string[]} */
  const errors = [];
  if (pack === null || typeof pack !== "object") errors.push("pack must be an object");
  if (!pack?.scene_pack_id || typeof pack.scene_pack_id !== "string") errors.push("scene_pack_id must be a string");
  if (!pack?.version || typeof pack.version !== "string") errors.push("version must be a string");
  if (!Array.isArray(pack?.presets) || pack.presets.length === 0) errors.push("presets must be a non-empty array");
  if (Array.isArray(pack?.presets)) {
    for (let i = 0; i < pack.presets.length; i++) {
      const preset = pack.presets[i];
      if (!preset?.preset_id) errors.push(`presets[${i}].preset_id is required`);
      if (!preset?.title) errors.push(`presets[${i}].title is required`);
      if (!preset?.prompt_recipe?.positive || !preset?.prompt_recipe?.negative) {
        errors.push(`presets[${i}].prompt_recipe must include positive and negative`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * @param {ScenePack} pack
 * @param {{ preset_id?: string, tags?: string[] }} args
 * @returns {ScenePreset | null}
 */
export function selectPreset(pack, args) {
  if (!pack?.presets?.length) return null;
  if (args.preset_id) {
    const found = pack.presets.find((p) => p.preset_id === args.preset_id);
    if (found) return found;
  }
  if (args.tags?.length) {
    const tagSet = new Set(args.tags.map((t) => t.toLowerCase()));
    const found = pack.presets.find((p) => (p.tags ?? []).some((t) => tagSet.has(String(t).toLowerCase())));
    if (found) return found;
  }
  return pack.presets[0];
}

/**
 * @param {Record<string, any>[]} objects
 * @returns {Record<string, any>}
 */
function mergeObjects(objects) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;
    for (const [key, value] of Object.entries(obj)) out[key] = value;
  }
  return out;
}

/**
 * Resolve a ScenePlan for a single render job.
 *
 * @param {{
 *  scene_pack: ScenePack,
 *  preset_id?: string,
 *  tags?: string[],
 *  persona_constraints?: Record<string, any>,
 *  overrides?: {
 *    prompt?: { positive_append?: string, negative_append?: string, style_prompt?: string },
 *    defaults?: Record<string, any>,
 *    constraints?: Record<string, any>,
 *    output?: Record<string, any>
 *  },
 *  seed?: number
 * }} args
 * @returns {ScenePlan}
 */
export function resolveScenePlan(args) {
  const preset = selectPreset(args.scene_pack, { preset_id: args.preset_id, tags: args.tags });
  if (!preset) throw new Error("no presets available");

  const overrides = args.overrides ?? {};
  const promptOverrides = overrides.prompt ?? {};
  const basePrompt = preset.prompt_recipe;

  const positive = [basePrompt.positive, promptOverrides.positive_append].filter(Boolean).join(" ").trim();
  const negative = [basePrompt.negative, promptOverrides.negative_append].filter(Boolean).join(" ").trim();
  const stylePrompt = promptOverrides.style_prompt ?? basePrompt.style_prompt;

  const defaults = mergeObjects([preset.defaults, overrides.defaults]);
  const constraints = mergeObjects([preset.constraints, args.persona_constraints, overrides.constraints]);
  const output = mergeObjects([overrides.output]);

  return {
    scene_pack_id: args.scene_pack.scene_pack_id,
    version: args.scene_pack.version,
    preset_id: preset.preset_id,
    seed: Number.isFinite(args.seed) ? args.seed : Date.now(),
    prompt: {
      positive: positive || basePrompt.positive,
      negative: negative || basePrompt.negative,
      style_prompt: stylePrompt,
      reference_image_refs: preset.reference_image_refs ?? [],
    },
    defaults,
    constraints,
    output,
  };
}

/**
 * In-memory background bank for caching generated backgrounds.
 */
export class BackgroundBank {
  constructor() {
    /** @type {Map<string, any>} */
    this.cache = new Map();
  }

  /** @param {string} key */
  get(key) {
    return this.cache.get(key) ?? null;
  }

  /** @param {string} key @param {any} value */
  set(key, value) {
    this.cache.set(key, value);
  }

  /**
   * @param {{ key: string, create: () => any }} args
   */
  resolveOrCreate(args) {
    const existing = this.get(args.key);
    if (existing) return existing;
    const created = args.create();
    this.set(args.key, created);
    return created;
  }
}
