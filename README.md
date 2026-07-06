# Bankcoin Capital — Token Assets

Canonical public metadata for the Bankcoin kStable family (38 fiat-referenced
stable tokens on Base `8453` and Arbitrum One `42161`) and supply endpoints for
those plus the EigenCarbon vintage coins (`EC2025`–`EC2030`, Ethereum `1`).

| Artifact | Canonical URL |
|---|---|
| Token list (v3.0.0) | https://assets.bankcoin.capital/tokenlist.json |
| Per-coin icons (256x256 PNG) | https://assets.bankcoin.capital/icons/kstables/<SYMBOL>.png |
| Per-address logos | https://assets.bankcoin.capital/logos/<chainId>/<address>/logo.png |
| Circulating supply (plain number) | https://assets.bankcoin.capital/supply/circulating?symbol=kUSD&chainId=8453 |
| Total supply (plain number) | https://assets.bankcoin.capital/supply/total?symbol=kUSD&chainId=8453 |
| Supply metadata (auditable JSON) | https://assets.bankcoin.capital/supply/meta?symbol=kUSD&chainId=8453 |
| Exclusion registry | https://assets.bankcoin.capital/supply/exclusions.json |

GitHub raw URLs under this repository serve the identical static files; the
`/supply/*` endpoints are Cloudflare Pages Functions (source in `functions/`)
performing live block-pinned chain reads — on RPC failure they return HTTP 503,
never a stale or fabricated number. Circulating supply = on-chain
`totalSupply()` minus the published exclusion balances in
[`supply/exclusions.json`](https://assets.bankcoin.capital/supply/exclusions.json) — any third
party can reproduce every figure from public RPC reads alone.

`tokenlist.json` sha256: `eea43f04b4e0a35accfb4b7398603a8b2e7fea9967049f24058c09272aeb5bb9`

Every entry is generated from the issuer's contract registry and validated
against on-chain `symbol()` / `decimals()` before publication. Issuer solvency
and reserve reporting: https://bankcoin.capital/solvency

Contact: admin@bankcoin.capital
