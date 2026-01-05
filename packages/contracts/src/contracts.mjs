/**
 * contracts -- runtime helpers
 *
 * Lightweight helpers for shared contract shapes described in:
 * `packages/contracts/product_spec.md`
 * `packages/contracts/tech_spec.md`
 * `packages/contracts/proto/common.proto`
 */

/**
 * @typedef {Object} BlobRef
 * @property {string} uri
 * @property {string=} format
 * @property {number=} width
 * @property {number=} height
 * @property {number=} sample_rate_hz
 * @property {number=} channels
 */

/**
 * @typedef {Object} InlineBytes
 * @property {Uint8Array} data
 * @property {string=} format
 * @property {number=} width
 * @property {number=} height
 * @property {number=} sample_rate_hz
 * @property {number=} channels
 */

/**
 * @param {any} value
 * @returns {value is BlobRef}
 */
export function isBlobRef(value) {
  return Boolean(value && typeof value.uri === "string");
}

/**
 * @param {any} value
 * @returns {value is InlineBytes}
 */
export function isInlineBytes(value) {
  return Boolean(value && value.data instanceof Uint8Array);
}

/**
 * @param {BlobRef} args
 * @returns {BlobRef}
 */
export function createBlobRef(args) {
  return {
    uri: args.uri,
    format: args.format,
    width: args.width,
    height: args.height,
    sample_rate_hz: args.sample_rate_hz,
    channels: args.channels,
  };
}

/**
 * @param {InlineBytes} args
 * @returns {InlineBytes}
 */
export function createInlineBytes(args) {
  const data = typeof args.data === "string" ? new TextEncoder().encode(args.data) : args.data;
  return {
    data,
    format: args.format,
    width: args.width,
    height: args.height,
    sample_rate_hz: args.sample_rate_hz,
    channels: args.channels,
  };
}

/**
 * @param {BlobRef|InlineBytes|Uint8Array|string} payload
 * @param {{ format?: string, width?: number, height?: number, sample_rate_hz?: number, channels?: number }} meta
 * @returns {BlobRef|InlineBytes}
 */
export function normalizePayload(payload, meta = {}) {
  if (isBlobRef(payload) || isInlineBytes(payload)) return payload;
  if (typeof payload === "string") {
    return createBlobRef({ uri: payload, format: meta.format, width: meta.width, height: meta.height });
  }
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  return createInlineBytes({
    data: bytes,
    format: meta.format,
    width: meta.width,
    height: meta.height,
    sample_rate_hz: meta.sample_rate_hz,
    channels: meta.channels,
  });
}
