#!/usr/bin/env node
/* ============================================================
   Arsenal Predictor — Smoke Test (Supabase Auth edition)
   ------------------------------------------------------------
   Runs before every push (see .githooks/pre-push). It uses only
   the PUBLIC anon key and checks two things:

     • Functionality — the public data the app needs is readable
       (active season, 38 fixtures, leaderboard, vote splits, and
       the username-availability check).
     • Security — the things that MUST be locked really are:
       profiles (emails), predictions, and the old players table
       are NOT readable with the public key, and the public key
       cannot write to fixtures.

   It creates no data, so there is nothing to clean up.
   Requires Node 18+ (built-in fetch). Reads URL/key from ../config.js.
   Exit code 0 = all passed, 1 = one or more failures.
   ============================================================ */

const fs   = require('fs');
const path = require('path');

function loadConfig() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
  const pick = (k) => (src.match(new RegExp(k + "\\s*:\\s*'([^']*)'")) || [])[1];
  const cfg = { url: pick('supabaseUrl'), key: pick('supabaseKey'), prefix: pick('tablePrefix') || '' };
  if (!cfg.url || !cfg.key) throw new Error('Could not read supabaseUrl / supabaseKey from config.js');
  return cfg;
}
const C = loadConfig();
const BASE = C.url.replace(/\/$/, '') + '/rest/v1/';
const H = { apikey: C.key, Authorization: 'Bearer ' + C.key };

async function get(pathAndQuery) {
  const res = await fetch(BASE + pathAndQuery, { headers: H });
  let body = null; try { body = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, body };
}
async function rpc(name, args) {
  const res = await fetch(BASE + 'rpc/' + C.prefix + name, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  let body = null; try { body = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, body };
}
async function tryInsert(table, row) {
  const res = await fetch(BASE + C.prefix + table, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(row),
  });
  return { ok: res.ok, status: res.status };
}

let passed = 0, failed = 0;
const line = (s) => process.stdout.write(s + '\n');
function ok(name, cond, detail = '') {
  if (cond) { passed++; line('  ✓ ' + name); }
  else { failed++; line('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}

async function run() {
  line('\nArsenal Predictor — smoke test');
  line('Target: ' + C.url + '  (prefix "' + C.prefix + '")\n');

  line('Public data (should work)');
  const seasons = await get(C.prefix + 'seasons?is_active=eq.true&select=*');
  ok('reach Supabase + read active season', seasons.ok && Array.isArray(seasons.body) && seasons.body.length === 1,
     'HTTP ' + seasons.status);

  const fixtures = await get(C.prefix + 'fixtures?select=id,home_team,away_team');
  const list = fixtures.body || [];
  ok('38 fixtures readable', fixtures.ok && list.length === 38, 'got ' + list.length);
  ok('every fixture involves Arsenal',
     fixtures.ok && !list.find(f => f.home_team !== 'Arsenal' && f.away_team !== 'Arsenal'));

  const lb = await get(C.prefix + 'leaderboard?select=*');
  ok('leaderboard view readable', lb.ok, 'HTTP ' + lb.status);

  const votes = await get(C.prefix + 'fixture_votes?select=*');
  ok('vote-split view readable', votes.ok, 'HTTP ' + votes.status);

  const avail = await rpc('username_available', { p_username: '__smoke_' + Date.now() });
  ok('username check works (unused name is available)', avail.ok && avail.body === true, 'HTTP ' + avail.status);

  line('\nSecurity (should be blocked)');
  // Protected = the public key gets either an error OR zero rows (row-level
  // security hides the data). Both mean no emails/picks leak.
  const rows = (r) => (Array.isArray(r.body) ? r.body.length : (r.ok ? -1 : 0));
  const profiles = await get(C.prefix + 'profiles?select=*');
  ok('profiles not exposed (no rows for public key)', !profiles.ok || rows(profiles) === 0,
     'HTTP ' + profiles.status + ', rows ' + rows(profiles));

  const preds = await get(C.prefix + 'predictions?select=*');
  ok('predictions not exposed (no rows for public key)', !preds.ok || rows(preds) === 0,
     'HTTP ' + preds.status + ', rows ' + rows(preds));

  const oldTable = await get(C.prefix + 'players?select=*');
  ok('old players table is gone', !oldTable.ok, 'HTTP ' + oldTable.status + ' (expected error)');

  const write = await tryInsert('fixtures', { id: '__smoke', season_id: 'x', match_week: 999, home_team: 'A', away_team: 'B' });
  ok('public key cannot write fixtures', !write.ok, 'HTTP ' + write.status + ' (expected error)');

  line('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ' — ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { line('  ✗ unexpected error: ' + e.message); process.exit(1); });
