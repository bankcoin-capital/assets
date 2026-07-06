// GET /supply/meta?symbol=kUSD&chainId=8453
//
// The auditable view: JSON carrying totalSupply, circulating, the full
// exclusion list with per-address balances, the pinned block, and the policy
// statement — everything a third party needs to reproduce the plain-number
// endpoints from raw chain reads (amounts are exact base-unit strings;
// *Formatted fields are derived display values).
//
// On any RPC failure: HTTP 503 (never a stale or fabricated 200).

import {
  computeSupply,
  corsPreflight,
  errorToResponse,
  jsonResponse,
  withEdgeCache,
} from "./_lib.js";

export async function onRequestGet(context) {
  return withEdgeCache(context, async () => {
    try {
      const s = await computeSupply(context);
      return jsonResponse(s);
    } catch (e) {
      return errorToResponse(e, true);
    }
  });
}

export function onRequestOptions() {
  return corsPreflight();
}
