#!/usr/bin/env node
/**
 * Headless scanner — runs the indicator over real or simulated bars and prints
 * session levels, liquidity raids, structure shifts and a deployable ticket.
 *
 *   node scan.js                          gold, 5m, live feed
 *   node scan.js --symbol BTCUSDT --tf 15 binance
 *   node scan.js --symbol EURUSD          any Yahoo Finance ticker
 *   node scan.js --mode sim               offline synthetic session feed
 *   node scan.js --json                   machine-readable output only
 *
 * Exit code is 0 whenever the engine ran, 1 when the feed or script failed.
 */
const https = require('https');
const { PineTS, Provider } = require('pinets');
const indicatorSource = require('./lib/indicator');

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const symbol = arg('--symbol', 'XAUUSD').toUpperCase();
const timeframe = String(arg('--tf', '5')).replace(/[^0-9]/g, '') || '5';
const bars = parseInt(arg('--bars', '800'), 10);
const mode = arg('--mode', 'live');
const asJson = args.includes('--json');

const fmtTime = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
const money = (v) => (Number.isFinite(v) ? '$' + v.toFixed(2) : '—');

function yahooCandles(ticker, interval, range) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const result = JSON.parse(body).chart?.result?.[0];
          if (!result?.timestamp) throw new Error('no data for ' + ticker);
          const q = result.indicators.quote[0];
          const out = [];
          result.timestamp.forEach((ts, i) => {
            if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) return;
            const openTime = ts * 1000;
            const close = +q.close[i].toFixed(2);
            const volume = q.volume[i] || 100;
            out.push({
              openTime,
              open: +q.open[i].toFixed(2),
              high: +q.high[i].toFixed(2),
              low: +q.low[i].toFixed(2),
              close,
              volume,
              closeTime: openTime + Number(interval.replace('m', '')) * 60000 - 1,
              quoteAssetVolume: volume * close,
              numberOfTrades: 10,
              takerBuyBaseAssetVolume: volume / 2,
              takerBuyQuoteAssetVolume: (volume / 2) * close,
              ignore: 0,
            });
          });
          resolve(out);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Offline feed: a session-shaped random walk so the scanner runs with no network.
function simulatedCandles(days = 3) {
  const out = [];
  let price = 4115;
  const start = Date.UTC(2026, 9, 19, 22, 0, 0);
  for (let i = 0; i < (days * 24 * 60) / 5; i++) {
    const openTime = start + i * 5 * 60000;
    const nyHour = (new Date(openTime).getUTCHours() - 4 + 24) % 24;
    const spread = nyHour >= 7 && nyHour < 10 ? 4.5 : nyHour >= 2 && nyHour < 6 ? 3.5 : 1.8;
    const open = price;
    const close = +(open + (Math.random() - 0.5) * spread * 2).toFixed(2);
    const high = +(Math.max(open, close) + Math.random() * spread).toFixed(2);
    const low = +(Math.min(open, close) - Math.random() * spread).toFixed(2);
    out.push({
      openTime, open, high, low, close,
      volume: 1000, closeTime: openTime + 299999,
      quoteAssetVolume: 1000 * close, numberOfTrades: 50,
      takerBuyBaseAssetVolume: 500, takerBuyQuoteAssetVolume: 500 * close, ignore: 0,
    });
    price = close;
  }
  return out;
}

async function feed() {
  if (mode === 'sim') return { pts: new PineTS(simulatedCandles(3), 'US30', timeframe), label: 'simulated Dow Jones session model' };
  if (symbol === 'XAUUSD' || symbol === 'GOLD' || symbol === 'GC=F') {
    try {
      return { pts: new PineTS(await yahooCandles('GC=F', timeframe + 'm', '5d'), 'XAUUSD', timeframe), label: 'Yahoo Finance GC=F (spot gold)' };
    } catch (e) {
      return { pts: new PineTS(Provider.Binance, 'PAXGUSDT', timeframe, bars), label: 'Binance PAXGUSDT fallback (' + e.message + ')' };
    }
  }
  if (/USDT|BUSD|BTC|ETH|SOL/.test(symbol)) {
    return { pts: new PineTS(Provider.Binance, symbol, timeframe, bars), label: 'Binance ' + symbol };
  }
  return { pts: new PineTS(await yahooCandles(symbol, timeframe + 'm', '5d'), symbol, timeframe), label: 'Yahoo Finance ' + symbol };
}

// The engine publishes de-mangled Pine variables; these are the contract.
function snapshotVariables(ctx) {
  const root = ctx.fullContext ?? ctx;
  const out = {};
  for (const bucket of [root.const, root.var, root.let]) {
    if (!bucket) continue;
    for (const [key, value] of Object.entries(bucket)) {
      if (key.startsWith('_')) continue;
      let current;
      if (value === null || value === undefined) current = value;
      else if (typeof value !== 'object') current = value;
      else if (Array.isArray(value)) current = value[value.length - 1];
      else if (Array.isArray(value.data)) current = value.data[value.data.length - 1 - (typeof value.offset === 'number' ? value.offset : 0)];
      else current = undefined;
      if (current !== undefined) out[key.replace(/^glb\d+_/, '')] = current;
    }
  }
  return out;
}

function ticket(v) {
  if (!v || !Number.isFinite(v.state)) {
    return { status: 'SCANNING', action: 'STANDBY', reason: 'indicator produced no state yet' };
  }
  const state = v.state;
  const source = v.setupSource || '';
  const long = state === 1 || state === 3 || state === 5;

  if (state === 5 || state === 6) {
    const risk = Math.abs(v.entryPrice - v.stopPrice);
    const reward = Math.abs(v.targetPrice - v.entryPrice);
    return {
      status: 'IN_POSITION',
      action: state === 5 ? 'BUY' : 'SELL',
      orderType: 'MARKET',
      model: (v.setupModel || 'OTE') + ' ' + (state === 5 ? 'long' : 'short'),
      entry: v.entryPrice,
      stopLoss: v.stopPrice,
      takeProfit: v.targetPrice,
      riskReward: risk > 0 ? +(reward / risk).toFixed(2) : null,
      targetSession: source,
    };
  }
  if (state === 3 || state === 4) {
    return {
      status: 'PENDING_ENTRY',
      action: long ? 'BUY LIMIT' : 'SELL LIMIT',
      orderType: 'LIMIT',
      model: 'OTE 0.618–0.786',
      entryZone: [v.fib786, v.fib618].filter(Number.isFinite),
      targetSession: source,
      takeProfit: v.setupTarget,
    };
  }
  if (state === 1 || state === 2) {
    return {
      status: 'AWAITING_MSS',
      action: 'STANDBY',
      bias: long ? 'BULLISH' : 'BEARISH',
      raidedSession: source,
      takeProfit: v.setupTarget,
      reason: 'liquidity raided — waiting for market structure shift',
    };
  }
  return { status: 'SCANNING', action: 'STANDBY', reason: 'waiting for the next session liquidity raid' };
}

(async () => {
  const { pts, label } = await feed();
  pts.setTimezone('America/New_York');
  await pts.ready();

  const started = Date.now();
  const ctx = await pts.run(indicatorSource());
  const elapsed = Date.now() - started;

  const values = snapshotVariables(ctx);
  const plan = ticket(values);

  const plots = ctx.plots || {};
  const live = (k) => (plots[k]?.data?.[0]?.value || []).filter((x) => x && !x._deleted);
  const labels = live('__labels__');
  const raids = labels.filter((l) => l.text && l.text.includes('RAID'));
  const shifts = labels.filter((l) => l.text && l.text.includes('SHIFT'));
  const levels = [];
  const seen = new Set();
  labels.forEach((l) => {
    if (!l.text || !/ [HL]$/.test(l.text) || /RAID|SHIFT/.test(l.text) || seen.has(l.text)) return;
    seen.add(l.text);
    levels.push({ session: l.text, price: l.y });
  });

  const payload = {
    symbol,
    timeframe: timeframe + 'm',
    feed: label,
    bars: pts.data.length,
    executionMs: elapsed,
    state: values.state ?? 0,
    sessionLevels: levels,
    raids: raids.slice(-10).map((r) => ({ label: r.text, bar: r.x, price: r.y, time: fmtTime(pts.data[r.x]?.openTime || 0) })),
    shifts: shifts.slice(-8).map((s) => ({ label: s.text, bar: s.x, price: s.y, time: fmtTime(pts.data[s.x]?.openTime || 0) })),
    ticket: plan,
  };

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const line = '─'.repeat(64);
  console.log(`\nPHASE 404  ${symbol} ${timeframe}m   feed: ${label}`);
  console.log(`${payload.bars} bars · ${elapsed}ms\n${line}`);

  console.log('COMPLETED SESSION LEVELS');
  if (!levels.length) console.log('  none in this window');
  levels.forEach((l) => console.log(`  ${l.session.padEnd(14)} ${money(l.price)}`));

  console.log(`\nLIQUIDITY RAIDS (${raids.length})`);
  if (!raids.length) console.log('  none in this window');
  raids.slice(-10).forEach((r) => console.log(`  ${fmtTime(pts.data[r.x]?.openTime || 0)}  ${r.text.padEnd(18)} ${money(r.y)}`));

  console.log(`\nSTRUCTURE SHIFTS (${shifts.length})`);
  if (!shifts.length) console.log('  none in this window');
  shifts.slice(-8).forEach((s) => console.log(`  ${fmtTime(pts.data[s.x]?.openTime || 0)}  ${s.text.padEnd(18)} ${money(s.y)}`));

  console.log(`\nTICKET\n${line}`);
  Object.entries(plan).forEach(([k, v]) => {
    const shown = Array.isArray(v) ? v.map(money).join(' – ') : typeof v === 'number' ? (k === 'riskReward' ? v + ':1' : money(v)) : v;
    console.log(`  ${k.padEnd(15)} ${shown}`);
  });
  console.log('');
})().catch((e) => { console.error('scan failed:', e.message); process.exit(1); });
