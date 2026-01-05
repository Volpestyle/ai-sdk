/**
 * moderation-policy -- reference implementation
 *
 * Implements policy pack composition and keyword-based gating described in:
 * `packages/moderation-policy/product_spec.md`
 * `packages/moderation-policy/tech_spec.md`
 */

export const ACTION_ORDER = Object.freeze({
  allow: 0,
  review: 1,
  block: 2,
});

export const ILLEGAL_ONLY_POLICY = Object.freeze({
  id: "illegal_only",
  description: "Baseline illegal-only policy",
  categories: {
    csam: {
      action: "block",
      keywords: ["csam", "child sexual", "minor sexual", "underage sex"],
    },
    trafficking: {
      action: "block",
      keywords: ["sex trafficking", "human trafficking", "exploit for sex"],
    },
    violent_wrongdoing: {
      action: "block",
      keywords: ["how to make a bomb", "build a bomb", "weapon instructions"],
    },
    extortion: {
      action: "block",
      keywords: ["blackmail", "sextortion", "ransom for nudes"],
    },
  },
});

/**
 * @typedef {Object} PolicyCategory
 * @property {"allow"|"review"|"block"} action
 * @property {string[]=} keywords
 */

/**
 * @typedef {Object} PolicyPack
 * @property {string} id
 * @property {string=} description
 * @property {Record<string, PolicyCategory>} categories
 */

/**
 * @typedef {Object} ModerationResult
 * @property {string[]} categories
 * @property {"allow"|"review"|"block"} action
 * @property {Record<string, string[]>=} keyword_hits
 */

/**
 * @param {PolicyPack[]} packs
 * @returns {PolicyPack}
 */
export function mergePolicyPacks(packs) {
  /** @type {Record<string, PolicyCategory>} */
  const categories = {};
  for (const pack of packs) {
    for (const [name, category] of Object.entries(pack.categories ?? {})) {
      const existing = categories[name];
      if (!existing) {
        categories[name] = {
          action: category.action,
          keywords: Array.from(new Set(category.keywords ?? [])),
        };
        continue;
      }
      const action = ACTION_ORDER[category.action] > ACTION_ORDER[existing.action] ? category.action : existing.action;
      const keywords = new Set([...(existing.keywords ?? []), ...(category.keywords ?? [])]);
      categories[name] = { action, keywords: Array.from(keywords) };
    }
  }
  return { id: "merged", categories };
}

/**
 * @param {string} text
 * @param {PolicyPack} pack
 * @returns {ModerationResult}
 */
export function evaluateTextPolicy(text, pack) {
  const lower = String(text ?? "").toLowerCase();
  /** @type {Record<string, string[]>} */
  const keywordHits = {};
  /** @type {string[]} */
  const categories = [];
  let worstAction = "allow";

  for (const [name, category] of Object.entries(pack.categories ?? {})) {
    const hits = (category.keywords ?? []).filter((kw) => lower.includes(String(kw).toLowerCase()));
    if (hits.length) {
      keywordHits[name] = hits;
      categories.push(name);
      if (ACTION_ORDER[category.action] > ACTION_ORDER[worstAction]) worstAction = category.action;
    }
  }

  return { categories, action: /** @type {ModerationResult["action"]} */ (worstAction), keyword_hits: keywordHits };
}

/**
 * @param {ModerationResult[]} results
 * @returns {ModerationResult}
 */
export function enforcePolicyTiers(results) {
  /** @type {ModerationResult} */
  const final = { categories: [], action: "allow", keyword_hits: {} };
  for (const res of results) {
    if (ACTION_ORDER[res.action] > ACTION_ORDER[final.action]) final.action = res.action;
    final.categories.push(...res.categories);
    if (res.keyword_hits) {
      for (const [cat, hits] of Object.entries(res.keyword_hits)) {
        final.keyword_hits[cat] = [...(final.keyword_hits[cat] ?? []), ...hits];
      }
    }
  }
  final.categories = Array.from(new Set(final.categories));
  return final;
}

/**
 * @param {{
 *  request_id: string,
 *  session_id?: string,
 *  job_id?: string,
 *  inputs?: Record<string, string>,
 *  result: ModerationResult,
 *  provider?: string
 * }} args
 */
export function buildAuditRecord(args) {
  return {
    request_id: args.request_id,
    session_id: args.session_id ?? null,
    job_id: args.job_id ?? null,
    provider: args.provider ?? "local",
    timestamp_ms: Date.now(),
    inputs: args.inputs ?? {},
    decision: args.result.action,
    categories: args.result.categories,
    keyword_hits: args.result.keyword_hits ?? {},
  };
}
