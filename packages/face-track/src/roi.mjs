/**
 * face-track — ROI stabilization helpers (reference)
 *
 * Implements a small slice of `packages/face-track/tech_spec.md`:
 * - mouth/face ROI computation from landmarks
 * - simple temporal smoothing of ROI transforms
 */

/**
 * @typedef {{ x: number, y: number } | [number, number]} Point2
 *
 * @typedef {Object} ROITransform
 * @property {[number, number, number, number]} crop_xywh pixels
 * @property {[number, number, number, number, number, number]=} affine_2x3 row-major 2x3
 * @property {[number, number]=} normalized_size
 */

/**
 * @param {Point2} p
 * @returns {{ x: number, y: number }}
 */
function toXY(p) {
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
}

/**
 * @param {Point2[]} points
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
function bounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const { x, y } = toXY(p);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/**
 * Compute an axis-aligned crop + affine mapping to a normalized ROI space.
 *
 * @param {{
 *   landmarks: Point2[],
 *   indices: number[],
 *   padding_ratio?: number,
 *   normalized_size?: [number, number],
 *   clamp_to?: { width: number, height: number }
 * }} args
 * @returns {ROITransform}
 */
export function roiFromLandmarks(args) {
  const paddingRatio = args.padding_ratio ?? 0.25;
  const normalizedSize = args.normalized_size ?? [96, 96];
  const selected = args.indices.map((i) => args.landmarks[i]).filter(Boolean);
  const { minX, minY, maxX, maxY } = bounds(selected);

  const w0 = Math.max(1, maxX - minX);
  const h0 = Math.max(1, maxY - minY);
  const padX = w0 * paddingRatio;
  const padY = h0 * paddingRatio;

  let x = minX - padX;
  let y = minY - padY;
  let w = w0 + 2 * padX;
  let h = h0 + 2 * padY;

  if (args.clamp_to) {
    x = Math.max(0, Math.min(x, args.clamp_to.width - 1));
    y = Math.max(0, Math.min(y, args.clamp_to.height - 1));
    w = Math.max(1, Math.min(w, args.clamp_to.width - x));
    h = Math.max(1, Math.min(h, args.clamp_to.height - y));
  }

  const [W, H] = normalizedSize;
  const scaleX = W / w;
  const scaleY = H / h;

  /** @type {[number, number, number, number, number, number]} */
  const affine = [scaleX, 0, -x * scaleX, 0, scaleY, -y * scaleY];

  return {
    crop_xywh: [x, y, w, h],
    affine_2x3: affine,
    normalized_size: normalizedSize,
  };
}

/**
 * Exponential smoothing over crop rect parameters.
 * @param {ROITransform} prev
 * @param {ROITransform} next
 * @param {number=} alpha higher => smoother (more weight on prev)
 * @returns {ROITransform}
 */
export function smoothRoi(prev, next, alpha = 0.8) {
  const a = Math.max(0, Math.min(1, alpha));
  const b = 1 - a;
  const [x0, y0, w0, h0] = prev.crop_xywh;
  const [x1, y1, w1, h1] = next.crop_xywh;

  const x = x0 * a + x1 * b;
  const y = y0 * a + y1 * b;
  const w = w0 * a + w1 * b;
  const h = h0 * a + h1 * b;

  // Recompute affine from the smoothed crop to avoid accumulating numerical drift.
  const normalizedSize = next.normalized_size ?? prev.normalized_size ?? [96, 96];
  const [W, H] = normalizedSize;
  const scaleX = W / Math.max(1e-6, w);
  const scaleY = H / Math.max(1e-6, h);
  /** @type {[number, number, number, number, number, number]} */
  const affine = [scaleX, 0, -x * scaleX, 0, scaleY, -y * scaleY];

  return { crop_xywh: [x, y, w, h], affine_2x3: affine, normalized_size: normalizedSize };
}

