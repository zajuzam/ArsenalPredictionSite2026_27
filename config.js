/**
 * Arsenal Predictor — Configuration
 *
 * ═══════════════════════════════════════════════════════════════
 *  TO START A NEW SEASON
 *  1. Update season.name and season.year below
 *  2. Delete predictor.db (the local database file)
 *  3. Restart the server — it will re-seed with the new fixtures
 *     (update the fixtures array in server.js first)
 * ═══════════════════════════════════════════════════════════════
 */

const CONFIG = {

  // ── Local API ──────────────────────────────────────────────
  apiUrl: 'http://localhost:3000/api',

  // ── Supabase (direct-to-DB, no local server needed) ────────
  supabaseUrl: 'https://xsjupwaatiyxvzjplyfx.supabase.co',
  supabaseKey: 'sb_publishable_fK6HZIqjnS7ucRcRWd3eKg_z06LcZi1',
  tablePrefix: 'arsenal_',

  // ── Admin ──────────────────────────────────────────────────
  // The admin logs in with username "admin" and this PIN.
  adminPin: '1234',   // CHANGE THIS before sharing

  // ── Current Season ────────────────────────────────────────
  season: { name: '2026/27', year: 2026 },

  // ── Optional: Auto-fetch results ──────────────────────────
  // Get a free key at https://www.football-data.org/
  footballDataApiKey: '',

  // ── Scoring ───────────────────────────────────────────────
  scoring: { exactScore: 3, correctResult: 1 },
};
