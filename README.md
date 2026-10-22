# PHASE 404 — Phase 1

A mechanical trading indicator for session-liquidity trading.
It reads New York session highs and lows, flags liquidity raids, waits for a market
structure shift, then produces OTE and IFVG setups with a stop, a target and a
broker-ready order payload.

Three ways to use it:

* **On TradingView** — add the protected script to any chart in one click. No source code involved.
* **Interactive chart** — live WebGL candlestick chart in your own browser, running locally.
* **Headless scanner** — one command runs the indicator over real market data and prints the current setup.

The TradingView route needs nothing installed. The local route needs no
TradingView account — just `npm install`.

---

## Use it on TradingView (no code, no setup)

**[PHASE 404 | Mechanical Model →](https://in.tradingview.com/script/QThYTBMI-PHASE-404-Mechanical-Model/)**

1. Open the link and click **Add to chart** (or star it first).
2. It appears under *Indicators → My scripts* in your TradingView chart from then on.

It is a **protected-source script**. You get the full indicator — sessions, raid
markers, structure shifts, OTE and IFVG zones, the session clock table, and every
setting — without being shown or touching the code. Works on 1m, 3m and 5m charts.

This is the fastest way to try it. The local options below are for automation, the
headless scanner, and running without a TradingView account.

---

## Quick start (local)

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

You get a live chart (default XAUUSD, 5m) with:

| Control | What it does |
| :--- | :--- |
| Symbol picker | XAUUSD (gold), BTC, ETH, SOL |
| `1m` `5m` `15m` `1h` | Change timeframe |
| Indicator ON / OFF | Show or hide the indicator, without reloading |
| ⚡ Deployed Orders Ticket | Opens the live order ticket drawer |

The ticket drawer always shows the indicator's *current* state — not a mock-up:
what session was raided, which way the bias points, where the target sits, and a
copyable JSON order payload when a setup is active.

---

## Headless scanner

```bash
npm run scan:sim        # offline simulated session feed, no network needed
npm run scan:gold       # live gold, 5m
npm run scan:crypto     # live BTCUSDT
node scan.js --symbol ETHUSDT --tf 15
node scan.js --json     # machine-readable, for your own tooling
```

Example output:

```
PHASE 404  XAUUSD 5m   feed: simulated Dow Jones session model
864 bars · 1043ms
────────────────────────────────────────────────────────────────
COMPLETED SESSION LEVELS
  ASIA H         $4073.90
  ASIA L         $4057.25
  LONDON H       $4084.65
  LONDON L       $4061.85
  NY AM H        $4101.45
  NY AM L        $4071.91

LIQUIDITY RAIDS (5)
  2026-10-22 08:10  ASIA RAID H        $4075.41
  2026-10-22 09:05  LONDON RAID H      $4089.40
  ...

TICKET
────────────────────────────────────────────────────────────────
  status          AWAITING_MSS
  action          STANDBY
  bias            BEARISH
  raidedSession   NY AM
  takeProfit      $4071.91
  reason          liquidity raided — waiting for market structure shift
```

`scan.js` exits `0` when it ran and `1` when the feed or the engine failed, so it
drops straight into a cron job or a monitoring script.

---

## What the strategy does

### 1. Session liquidity map

Four sessions, all in New York time with DST handled:

| Session | NY time | Colour |
| :--- | :--- | :--- |
| Asia | 20:00 – 00:00 | Yellow |
| London | 02:00 – 05:00 | Blue |
| NY AM | 07:00 – 10:00 | Orange |
| NY PM | 13:00 – 19:00 | Red |

When a session closes, its high and low are fixed and drawn as reference levels.
Those completed extremes are the liquidity the market will later reach for.

### 2. Raid → bias → target

* **A session high is raided** (price wicks through it and comes back) → **bearish**.
  Target is that same session's **low**.
* **A session low is raided** → **bullish**. Target is that same session's **high**.

A raid can be a single wick or a multi-bar run that closes back inside. If one
impulse sweeps several sessions' extremes at once, the **outermost** extreme wins —
sweeping NY AM *and* Asia highs locks the target to Asia's low, not NY AM's.

### 3. Confirmation

A raid alone is not an entry. The indicator then waits for a **market structure
shift** — a break of the 3-bar swing pivot in the raided direction. Without that
break, no trade.

### 4. Entry models

After the shift, one of two models arms:

* **OTE** — limit entry in the `0.618 – 0.786` retracement of the displacement leg.
* **IFVG** — entry on the retest of an inverted fair value gap.

Stop sits just beyond the raid extreme (or the gap boundary); target is the
opposite extreme of the raided session.

### 5. Setup states

The indicator publishes one state number, which is what the ticket reads:

| State | Meaning | Ticket |
| :--- | :--- | :--- |
| `0` | Scanning | `STANDBY` |
| `1` / `2` | Raid confirmed, waiting for shift | `AWAITING_MSS` |
| `3` / `4` | Shift confirmed, waiting for retrace | `BUY LIMIT` / `SELL LIMIT` |
| `5` / `6` | In position | `BUY` / `SELL` |

### 6. Chart clutter

The chart keeps only the recent raid and shift markers, only the newest trade
boxes, and puts session tags in small type in the box corners so candles stay
readable. Everything is switchable from the indicator settings.

---

## What is in this repo

| Path | Purpose |
| :--- | :--- |
| `index.js` | Local web server for the chart on port 3000 |
| `public/index.html` | The chart app: chart, controls, order ticket drawer |
| `scan.js` | Headless scanner — runs the indicator on real or simulated data, prints levels / raids / shifts / ticket |
| `lib/indicator.js` | Decodes the compiled indicator asset for Node |
| `assets/p404.asset` | The compiled indicator (gzip + base64) |
| `test/smoke.js` | End-to-end check: server, chart, indicator compile, ticket |

### About `assets/p404.asset`

The strategy logic in this repository ships **compiled, not as readable source**.
It is a single binary asset that the chart and the scanner load directly. There is
nothing to configure inside it: the sessions, the raid logic, the confirmation step
and the entry models above are what it runs.

The same logic runs on TradingView as a protected-source script — the local asset
and the TradingView script are the two delivery forms of one indicator.

---

## Requirements

* Node.js 18 or newer (uses the built-in `fetch` and `DecompressionStream`)
* Chrome or Chromium only if you want to run `node test/smoke.js`
* Internet access for live data (`npm run scan:sim` and the simulated feed work offline)

Market data: Binance public API for crypto, Yahoo Finance for gold and other
Yahoo tickers. Both are free and keyless.

---

## Testing

```bash
node scan.js --mode sim --json   # engine runs, emits valid JSON
node test/smoke.js               # full chart + ticket check in a headless browser
```

---

## Disclaimer

This software is an indicator, not financial advice, and it is not a broker.
It does not place orders — it prints the numbers for you to place them.
Trading carries substantial risk of loss. Use it with your own judgement and risk
management, and test it on a demo account first.

---

## Links

* **TradingView:** https://in.tradingview.com/script/QThYTBMI-PHASE-404-Mechanical-Model/
* **Repository:** https://github.com/pavanarya24/phase4o4

---

## Licence

See [LICENSE](LICENSE).
