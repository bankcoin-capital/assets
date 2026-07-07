// GET /supply/total?symbol=kUSD&chainId=8453
//
// Plain-number body (CoinGecko / CoinMarketCap convention): on-chain
// totalSupply() in token units at a pinned block. No exclusions applied —
// see /supply/circulating for the float and /supply/meta for the audit view.
//
// On any RPC failure: HTTP 503 (never a stale or fabricated 200).

import {
  computeSupply,
  corsPreflight,
  errorToResponse,
  textResponse,
  withEdgeCache,
} from "./_lib.js";

export async function onRequestGet(context) {
  return withEdgeCache(context, async () => {
    try {
      const s = await computeSupply(context);
      return textResponse(s.totalSupplyFormatted);
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
