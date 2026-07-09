// GET /defillama/yields
//
// Hosted feed for the (draft) DeFi Llama yield-server adapter — see
// docs/defillama/ in the monorepo. Returns per-pool records in a shape
// trivially mappable to yield-server's pool schema:
//   { pool, chain, project, symbol, tvlUsd, apyBase, apyReward, rewardTokens,
//     underlyingTokens, poolMeta, url }
//
// Sections:
//   pools    — the kUSD anchor pools (kUSD vs USDC/USDT/USDT0/EURC) from the
//              static registry /pools.json, with TVL computed from LIVE
//              block-pinned reserves via the exact same Multicall3 path as
//              /pools (imported — the two surfaces can never diverge).
//              apyBase is a 0.0 placeholder until the term-deposit rate engine
//              ships; we never fabricate an APY.
//   deposits — feature-detected passthrough of the term-deposit rate engine's
//              GET /deposits/rates. Until that endpoint is live upstream the
//              section is OMITTED with an explanatory `depositsNote` — never
//              fabricated, never a fake 200 shape.
//
// MONEY-TRUTH RULE (CLAUDE.md): every TVL figure is a live chain read pinned
// to ONE block per chain. On any RPC failure for the pool section we return
// HTTP 503 — never a partial pool set, never stale-as-fresh. Exact reserves
// are returned as integer/decimal strings; tvlUsd is a DERIVED display float
// computed at the leaf (external stable valued at $1.00, the kUSD leg at the
// pool's own mid price — methodology echoed in the response).
// Successful responses are edge-cached for 5 minutes.

import { corsPreflight, SupplyError } from "../supply/_lib.js";
import {
  loadPools,
  readPoolsViaMulticall,
  buildPool,
  CALLS_PER_POOL,
} from "../pools/index.js";

const CACHE_SECONDS = 300; // 5-minute edge cache — DeFi Llama polls hourly

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

// DeFi Llama chain naming (yield-server utils.formatChain conventions).
const CHAIN_META = {
  8453: { name: "Base", slug: "base" },
  42161: { name: "Arbitrum", slug: "arbitrum" },
  1: { name: "Ethereum", slug: "ethereum" },
};

// Placeholder protocol slug. MUST match the project's slug on
// defillama.com/protocols once the TVL listing exists (prerequisite for the
// yields adapter — see docs/defillama/README.md). Echoed as a note so no
// consumer mistakes it for a live listing.
const PROJECT_SLUG = "bankcoin-capital";
const PROJECT_URL = "https://bankcoin.capital";

// The external-stable legs we recognise as kUSD anchors (same set the
// publish-time registry probes at every fee tier).
const ANCHOR_EXTERNALS = new Set(["USDC", "USDT", "USDT0", "EURC"]);

// Term-deposit rate engine upstream candidates, probed in order. The product
// is being built in parallel (G10 kStable term deposits, sovereign curve
// +350bps); until GET /deposits/rates ships these 404 and the deposits
// section is omitted with a note.
const DEPOSIT_RATE_UPSTREAMS = [
  "https://api.cryptodeposit.org/deposits/rates",
  "https://api.bankcoin.capital/deposits/rates",
];

function jsonResponse(obj, status = 200, cacheable = status === 200) {
  return new Response(JSON.stringify(obj, null, 2) + "\n", {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheable
        ? `public, max-age=${CACHE_SECONDS}`
        : "no-store",
      ...(status === 503 ? { "Retry-After": "10" } : {}),
    },
  });
}

// USD value of one kUSD in this pool, derived from the pool's own mid price.
// buildPool's `price` is token1-per-token0 in POOL ordering (token0 = lower
// address). Both legs are 6-decimal, so the raw ratio is the whole-unit ratio.
// The external stable is valued at $1.00 (anchor legs are USDC/USDT-class).
function usdPerKusd(built, registryRow) {
  const kusdAddr = registryRow.addrA.toLowerCase(); // registry rows are kUSD/<ext>
  const extAddr = registryRow.addrB.toLowerCase();
  const kusdIsToken0 = BigInt(kusdAddr) < BigInt(extAddr);
  return kusdIsToken0 ? built.price : 1 / built.price;
}

function anchorRecord(chainId, chainMeta, built, row, asOfBlock) {
  const kusdUsd = usdPerKusd(built, row);
  // Registry ordering: A = kUSD, B = external stable.
  const reserveKusd = Number(built.reserveA);
  const reserveExt = Number(built.reserveB);
  const tvlUsd = reserveExt * 1.0 + reserveKusd * kusdUsd;
  const feePct = built.fee / 10000;
  return {
    // ── yield-server-mappable fields ─────────────────────────────────────
    pool: `${built.pool.toLowerCase()}-${chainMeta.slug}`,
    chain: chainMeta.name,
    project: PROJECT_SLUG,
    symbol: `${row.symA.toUpperCase()}-${row.symB.toUpperCase()}`,
    tvlUsd,
    apyBase: 0, // placeholder — no fabricated APY; swap-fee APY TBD at listing
    apyReward: null,
    rewardTokens: [],
    underlyingTokens: [row.addrA, row.addrB],
    poolMeta: `Uniswap v3 ${feePct}% ${row.pair} anchor pool`,
    url: PROJECT_URL,
    // ── exact-truth extras (house wei-discipline; adapter may ignore) ────
    exact: {
      chainId,
      poolAddress: built.pool,
      feeTier: built.fee,
      asOfBlock,
      reserveKusd: built.reserveA,
      reserveExternal: built.reserveB,
      reserveKusdRaw: built.reserveARaw,
      reserveExternalRaw: built.reserveBRaw,
      sqrtPriceX96: built.sqrtPriceX96,
      tick: built.tick,
      liquidity: built.liquidity,
      kusdMidPriceUsd: kusdUsd,
    },
  };
}

// Feature-detect the term-deposit rate engine. NEVER throws and NEVER
// fabricates: first upstream returning HTTP 200 + valid JSON wins; a 404
// means "not shipped yet"; any other failure is reported verbatim.
async function fetchDepositRates() {
  const attempts = [];
  for (const upstream of DEPOSIT_RATE_UPSTREAMS) {
    try {
      const res = await fetch(upstream, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status === 404) {
        attempts.push(`${upstream} -> 404 (not shipped yet)`);
        continue;
      }
      if (!res.ok) {
        attempts.push(`${upstream} -> HTTP ${res.status}`);
        continue;
      }
      const body = await res.json();
      return {
        deposits: {
          source: upstream,
          fetchedAtUtc: new Date().toISOString(),
          note:
            "verbatim passthrough of the term-deposit rate engine " +
            "(GET /deposits/rates); map termDays/apy into poolMeta/apyBase " +
            "in the yield-server adapter",
          upstream: body,
        },
      };
    } catch (e) {
      attempts.push(`${upstream} -> ${String(e && e.message ? e.message : e)}`);
    }
  }
  return {
    depositsNote:
      "term-deposit rates endpoint not yet live — deposits section omitted " +
      "(never fabricated). Probed: " +
      attempts.join(" | "),
  };
}

async function computeYields(context) {
  const config = await loadPools(context);

  // Collect kUSD anchor pools per chain from the static registry.
  const perChain = [];
  for (const key of Object.keys(config)) {
    if (!/^[0-9]+$/.test(key) || !Array.isArray(config[key])) continue;
    const anchors = config[key].filter(
      (p) => p.symA === "kUSD" && ANCHOR_EXTERNALS.has(p.symB)
    );
    if (anchors.length) perChain.push({ chainId: Number(key), anchors });
  }
  if (!perChain.length) {
    throw new SupplyError(503, "no kUSD anchor pools in registry /pools.json");
  }

  // Live reserves: one Multicall3 aggregate per chain at one pinned block —
  // identical path to /pools. Any chain failing all its RPCs ⇒ 503 (never a
  // partial pool set).
  const pools = [];
  const chains = [];
  for (const { chainId, anchors } of perChain) {
    const meta = CHAIN_META[chainId] || {
      name: `chain${chainId}`,
      slug: `chain${chainId}`,
    };
    const rpcs = (config.rpcs && config.rpcs[String(chainId)]) || [];
    const multicall3 = config.multicall3;
    if (!rpcs.length || !multicall3) {
      throw new SupplyError(
        503,
        `pool registry missing RPC/multicall config for chainId ${chainId}`
      );
    }
    const errors = [];
    let done = false;
    for (const rpcUrl of rpcs) {
      try {
        const { blockNumber, raw } = await readPoolsViaMulticall(
          rpcUrl,
          multicall3,
          anchors
        );
        anchors.forEach((row, i) => {
          const built = buildPool(row, raw, i * CALLS_PER_POOL);
          pools.push(anchorRecord(chainId, meta, built, row, blockNumber));
        });
        chains.push({
          chainId,
          chain: meta.name,
          asOfBlock: blockNumber,
          rpc: rpcUrl,
          anchorPools: anchors.length,
        });
        done = true;
        break;
      } catch (e) {
        errors.push(String(e && e.message ? e.message : e));
      }
    }
    if (!done) {
      throw new SupplyError(
        503,
        `all RPC endpoints failed for chainId ${chainId}: ${errors.join(" | ")}`
      );
    }
  }

  const depositSection = await fetchDepositRates();

  return {
    generatedAtUtc: new Date().toISOString(),
    project: {
      slug: PROJECT_SLUG,
      url: PROJECT_URL,
      note:
        "slug is a PLACEHOLDER until the DefiLlama protocol (TVL) listing " +
        "exists; the yield-server adapter's `project` field must match the " +
        "live defillama.com protocol slug",
    },
    methodology: {
      tvlUsd:
        "external stable leg valued at $1.00; kUSD leg at the pool's own " +
        "block-pinned mid price (slot0). Exact reserves returned as strings " +
        "under `exact`; tvlUsd is a derived display float.",
      apyBase:
        "0.0 placeholder — the G10 kStable term-deposit rate engine " +
        "(sovereign curve +350bps) is being built; no APY is fabricated. " +
        "Once GET /deposits/rates ships, per-term rates appear under " +
        "`deposits`.",
    },
    chains,
    count: pools.length,
    pools,
    ...depositSection,
    source: {
      registry: "/pools.json",
      registryVersion: config.version,
      registryGeneratedAtUtc: config.generatedAtUtc,
      livePoolState: "/pools?chainId=<id> (same Multicall3 path)",
      docs: "https://github.com/bankcoin-capital/assets",
    },
  };
}

// 5-minute edge cache (Cache API). Only 200s are cached; errors never are.
async function withEdgeCache(context, handler) {
  const url = new URL(context.request.url);
  const key = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await handler();
  if (res.status === 200) context.waitUntil(cache.put(key, res.clone()));
  return res;
}

export async function onRequestGet(context) {
  return withEdgeCache(context, async () => {
    try {
      return jsonResponse(await computeYields(context));
    } catch (e) {
      const status = e instanceof SupplyError ? e.status : 500;
      return jsonResponse(
        { error: String(e && e.message ? e.message : e) },
        status,
        false
      );
    }
  });
}

export function onRequestOptions() {
  return corsPreflight();
}

// HEAD behaves like GET minus the body (the runtime strips it).
export { onRequestGet as onRequestHead };
