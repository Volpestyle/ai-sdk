/**
 * postprocess-compositing -- reference implementation
 *
 * Pipeline helpers based on:
 * `packages/postprocess-compositing/product_spec.md`
 * `packages/postprocess-compositing/tech_spec.md`
 */

import { randomUUID } from "node:crypto";

export const DEFAULT_EXPORT_PROFILES = Object.freeze({
  image_png: {
    kind: "image",
    format: "png",
    quality: 1.0,
  },
  image_jpeg: {
    kind: "image",
    format: "jpeg",
    quality: 0.92,
  },
  video_h264: {
    kind: "video",
    format: "h264",
    bitrate_kbps: 3500,
    audio: { codec: "opus", bitrate_kbps: 96 },
  },
  video_av1: {
    kind: "video",
    format: "av1",
    bitrate_kbps: 2500,
    audio: { codec: "opus", bitrate_kbps: 96 },
  },
});

/**
 * @typedef {Object} CompositingStep
 * @property {string} type
 * @property {Record<string, any>=} params
 */

/**
 * @typedef {Object} CompositingPlan
 * @property {CompositingStep[]} steps
 * @property {string[]} notes
 */

/**
 * @param {{ kind?: "image"|"video", preset?: string }} args
 * @returns {typeof DEFAULT_EXPORT_PROFILES[keyof typeof DEFAULT_EXPORT_PROFILES]}
 */
export function selectExportProfile(args) {
  const preset = args.preset ?? (args.kind === "video" ? "video_h264" : "image_png");
  return DEFAULT_EXPORT_PROFILES[preset] ?? DEFAULT_EXPORT_PROFILES.image_png;
}

/**
 * @param {{
 *  subject_ref: string,
 *  alpha_ref?: string,
 *  background_ref?: string,
 *  options?: {
 *    edge_feather_px?: number,
 *    dehalo_px?: number,
 *    color_match?: "lab_mean_std" | "histogram" | "none",
 *    relight?: boolean,
 *    relight_strength?: number,
 *    final_grade?: boolean,
 *    upscale?: boolean,
 *    upscale_model?: string,
 *    restore_face?: boolean,
 *    restore_strength?: number,
 *    lipsync_correction?: boolean,
 *    lipsync_model?: string
 *  }
 * }} args
 * @returns {CompositingPlan}
 */
export function buildCompositingPlan(args) {
  const opts = args.options ?? {};
  /** @type {CompositingStep[]} */
  const steps = [];
  /** @type {string[]} */
  const notes = [];

  if (args.alpha_ref) {
    steps.push({
      type: "edge_refine",
      params: { feather_px: opts.edge_feather_px ?? 2, dehalo_px: opts.dehalo_px ?? 1 },
    });
  }

  const colorMatch = opts.color_match ?? "lab_mean_std";
  if (colorMatch !== "none") {
    steps.push({ type: "color_match", params: { mode: colorMatch } });
  }

  if (opts.relight) {
    steps.push({ type: "relight", params: { strength: opts.relight_strength ?? 0.35 } });
  }

  steps.push({
    type: "alpha_composite",
    params: {
      subject_ref: args.subject_ref,
      alpha_ref: args.alpha_ref ?? null,
      background_ref: args.background_ref ?? "solid://black",
    },
  });

  if (opts.final_grade) {
    steps.push({ type: "final_grade", params: { contrast: 1.05, saturation: 1.03 } });
  }

  if (opts.upscale) {
    steps.push({ type: "upscale", params: { model: opts.upscale_model ?? "real-esrgan", scale: 2 } });
  }

  if (opts.restore_face) {
    steps.push({ type: "restore_face", params: { model: "codeformer", strength: opts.restore_strength ?? 0.4 } });
  }

  if (opts.lipsync_correction) {
    steps.push({ type: "lip_sync_correction", params: { model: opts.lipsync_model ?? "wav2lip" } });
  }

  if (!args.background_ref) notes.push("background_ref_missing");

  return { steps, notes };
}

/**
 * @param {{
 *  subject_ref: string,
 *  alpha_ref?: string,
 *  background_ref?: string,
 *  export_profile?: { kind?: "image"|"video", preset?: string },
 *  options?: Parameters<typeof buildCompositingPlan>[0]["options"],
 *  now_ms?: number
 * }} args
 */
export function composeMedia(args) {
  const plan = buildCompositingPlan({
    subject_ref: args.subject_ref,
    alpha_ref: args.alpha_ref,
    background_ref: args.background_ref,
    options: args.options,
  });
  const profile = selectExportProfile(args.export_profile ?? {});
  const createdMs = args.now_ms ?? Date.now();
  const ref = `composite://${randomUUID()}`;
  return {
    composite_ref: ref,
    plan,
    export_profile: profile,
    created_ms: createdMs,
  };
}
