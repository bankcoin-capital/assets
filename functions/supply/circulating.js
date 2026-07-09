// GET /supply/circulating?symbol=kUSD&chainId=8453
//
// CoinGecko / CoinMarketCap supply-verification convention: the response body
// is the circulating supply as a PLAIN decimal number in token units — no
// JSON wrapper, no separators, nothing else.
//
// circulating = totalSupply() − Σ balanceOf(published exclusion addresses),
// read at a single pinned block (see /supply/meta for the auditable view and
// /supply/exclusions.json for the exclusion registry).
//
// On any RPC failure: HTTP 503 (never a stale or fabricated 200).

import {
  computeSupply,
  computeSupplyAggregate,
  corsPreflight,
  errorToResponse,
  textResponse,
  withEdgeCache,
} from "./_lib.js";

export async function onRequestGet(context) {
  return withEdgeCache(context, async () => {
    try {
      // No chainId → cross-chain aggregate (what CG displays for a multi-chain
      // token). With chainId → that chain only.
      const hasChain = new URL(context.request.url).searchParams.get("chainId");
      const s = hasChain
        ? await computeSupply(context)
        : await computeSupplyAggregate(context);
      return textResponse(s.circulatingFormatted);
    } catch (e) {
      return errorToResponse(e, false);
    }
  });
}

export function onRequestOptions() {
  return corsPreflight();
}

// HEAD must behave like GET minus the body (some listing validators probe
// with HEAD); the runtime strips the body automatically.
export { onRequestGet as onRequestHead };
