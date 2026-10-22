/**
 * Smoke test: the shipped repo must actually render.
 *
 *   node test/smoke.js
 *
 * Starts the server on a free port, loads the chart in Chrome, asserts the
 * indicator compiles from the asset and the order ticket reads live state.
 * Exits non-zero on failure.
 */
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 3457;
const fails = [];
const ok = (cond, msg) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + msg); if (!cond) fails.push(msg); };

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 1500));

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  try {
    await page.goto('http://localhost:' + PORT, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => document.getElementById('script-status').textContent.includes('Active'),
      { timeout: 60000 }
    );
    ok(true, 'indicator compiled from the asset and went Active');

    await page.click('#toggle-ticket');
    await page.waitForTimeout(1500);

    const detail = await page.evaluate(() => ({
      status: document.getElementById('ticket-status').textContent,
      action: document.getElementById('ticket-action').textContent,
      payload: document.getElementById('ticket-payload').value,
    }));

    let parsed = null;
    try { parsed = JSON.parse(detail.payload); } catch (e) { /* asserted below */ }
    ok(!!parsed, 'ticket payload is valid JSON');
    ok(parsed && parsed.strategy === 'PHASE_404_PHASE1', 'payload carries the strategy id');
    ok(parsed && parsed.symbol, 'payload carries the live symbol');
    ok(detail.action.trim().length > 0, 'ticket action rendered: ' + detail.action.trim());
    ok(detail.status.trim().length > 0, 'ticket status rendered: ' + detail.status.trim());
    ok(!errors.some((e) => /indicator|asset|Pine/i.test(e)), 'no indicator/asset errors in console');
  } catch (e) {
    ok(false, 'chart never became active: ' + e.message);
    if (errors.length) console.log('  console errors:\n   ' + errors.join('\n   '));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(fails.length ? '\n' + fails.length + ' CHECK(S) FAILED' : '\nALL CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})();
