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
| Live pool data (JSON) | https://assets.bankcoin.capital/pools?chainId=8453 (optional &pair=kEUR/kUSD) |
| Pool registry | https://assets.bankcoin.capital/pools.json |
| DeFi Llama yields feed | https://assets.bankcoin.capital/defillama/yields |

GitHub raw URLs under this repository serve the identical static files; the
`/supply/*` endpoints are Cloudflare Pages Functions (source in `functions/`)
performing live block-pinned chain reads — on RPC failure they return HTTP 503,
never a stale or fabricated number. Circulating supply = on-chain
`totalSupply()` minus the published exclusion balances in
[`supply/exclusions.json`](https://assets.bankcoin.capital/supply/exclusions.json) — any third
party can reproduce every figure from public RPC reads alone.

`tokenlist.json` sha256: `5fb5b9ad4f66d906837ac9e825b884a3112e8143debb2b3233f16b962c9bfd04`

Every entry is generated from the issuer's contract registry and validated
against on-chain `symbol()` / `decimals()` before publication. Issuer solvency
and reserve reporting: https://bankcoin.capital/solvency

Contact: admin@bankcoin.capital
