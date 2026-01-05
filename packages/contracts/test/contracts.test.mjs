import test from "node:test";
import assert from "node:assert/strict";

import { createBlobRef, createInlineBytes, isBlobRef, isInlineBytes, normalizePayload } from "../src/contracts.mjs";

test("blob ref helpers round trip", () => {
  const ref = createBlobRef({ uri: "s3://bucket/key", format: "mp4" });
  assert.ok(isBlobRef(ref));
  assert.equal(ref.uri, "s3://bucket/key");
});

test("inline bytes helpers round trip", () => {
  const inline = createInlineBytes({ data: new Uint8Array([1, 2, 3]), format: "pcm" });
  assert.ok(isInlineBytes(inline));
  assert.equal(inline.data.length, 3);
});

test("normalizePayload accepts uri string or bytes", () => {
  const blob = normalizePayload("s3://bucket/key", { format: "mp4" });
  assert.ok(isBlobRef(blob));

  const inline = normalizePayload(new Uint8Array([9, 9, 9]), { format: "pcm" });
  assert.ok(isInlineBytes(inline));
});
