/* ============================================================
   Arsenal Predictor — Local Server (Node.js + PostgreSQL)
   Run: node server.js
   Then open: http://localhost:3000
   ============================================================ */

const { Pool }  = require('pg');
const express   = require('express');
const crypto    = require('crypto');
const path      = require('path');
const cors      = require('cors');

const app  = express();
const PORT = 3000;

// ── DB Connection ─────────────────────────────────────────────
// Edit these to match your local Postgres setup
const pool = new Pool({
  host:     'localhost',
  port:     5432,
  database: 'arsenal_predictor',   // name of the DB you created
  user:     'postgres',            // your Postgres username
  password: 'your_password_here',  // your Postgres password
});

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ── Helpers ───────────────────────────────────────────────────
function getResult(h, a) { return h > a ? 'H' : a > h ? 'A' : 'D'; }

async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// ── API: Auth ─────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, email, pin_hash, is_admin } = req.body;
  try {
    const id = crypto.randomUUID();
    await query(
      'INSERT INTO players (id, username, email, pin_hash, is_admin) VALUES ($1,$2,$3,$4,$5)',
      [id, username, email || null, pin_hash, is_admin || false]
    );
    const player = await queryOne('SELECT * FROM players WHERE id=$1', [id]);
    res.json({ data: player });
  } catch (err) {
    if (err.code === '23505') {
      res.status(409).json({ error: { code: '23505', message: 'Username already taken' } });
    } else {
      res.status(500).json({ error: { message: err.message } });
    }
  }
});

app.post('/api/login', async (req, res) => {
  const { username, pin_hash } = req.body;
  const player = await queryOne(
    'SELECT * FROM players WHERE username=$1 AND pin_hash=$2',
    [username, pin_hash]
  );
  if (!player) return res.status(401).json({ error: { message: 'Incorrect username or PIN' } });
  res.json({ data: player });
});

// ── API: Season ───────────────────────────────────────────────
app.get('/api/season', async (req, res) => {
  const season = await queryOne('SELECT * FROM seasons WHERE is_active=TRUE');
  res.json({ data: season });
});

// ── API: Fixtures ─────────────────────────────────────────────
app.get('/api/fixtures', async (req, res) => {
  const { season_id } = req.query;
  const rows = await query(
    'SELECT * FROM fixtures WHERE season_id=$1 ORDER BY match_week',
    [season_id]
  );
  res.json({ data: rows });
});

app.put('/api/fixtures/:id/result', async (req, res) => {
  const { home_score, away_score } = req.body;
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      "UPDATE fixtures SET home_score=$1, away_score=$2, status='completed' WHERE id=$3",
      [home_score, away_score, id]
    );

    const { rows: preds } = await client.query(
      'SELECT * FROM predictions WHERE fixture_id=$1', [id]
    );
    const actual = getResult(home_score, away_score);

    for (const p of preds) {
      let pts = 0;
      if (p.predicted_home === home_score && p.predicted_away === away_score) pts = 3;
      else if (getResult(p.predicted_home, p.predicted_away) === actual) pts = 1;

      const prev = p.points_earned || 0;
      const { rows: [pl] } = await client.query(
        'SELECT total_points FROM players WHERE id=$1', [p.player_id]
      );
      const newTotal = Math.max(0, (pl?.total_points || 0) - prev + pts);

      await client.query('UPDATE predictions SET points_earned=$1 WHERE id=$2', [pts, p.id]);
      await client.query('UPDATE players SET total_points=$1 WHERE id=$2', [newTotal, p.player_id]);
    }

    await client.query('COMMIT');
    const fixture = await queryOne('SELECT * FROM fixtures WHERE id=$1', [id]);
    res.json({ data: fixture });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: { message: err.message } });
  } finally {
    client.release();
  }
});

// ── API: Predictions ──────────────────────────────────────────
app.get('/api/predictions', async (req, res) => {
  const { player_id } = req.query;
  const rows = await query('SELECT * FROM predictions WHERE player_id=$1', [player_id]);
  res.json({ data: rows });
});

app.post('/api/predictions', async (req, res) => {
  const { player_id, fixture_id, predicted_home, predicted_away } = req.body;
  try {
    const existing = await queryOne(
      'SELECT id FROM predictions WHERE player_id=$1 AND fixture_id=$2',
      [player_id, fixture_id]
    );
    if (existing) {
      await query(
        'UPDATE predictions SET predicted_home=$1, predicted_away=$2, updated_at=NOW() WHERE id=$3',
        [predicted_home, predicted_away, existing.id]
      );
    } else {
      await query(
        'INSERT INTO predictions (id, player_id, fixture_id, predicted_home, predicted_away) VALUES ($1,$2,$3,$4,$5)',
        [crypto.randomUUID(), player_id, fixture_id, predicted_home, predicted_away]
      );
    }
    const pred = await queryOne(
      'SELECT * FROM predictions WHERE player_id=$1 AND fixture_id=$2',
      [player_id, fixture_id]
    );
    res.json({ data: pred });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// ── API: Leaderboard ──────────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
  const players = await query(
    'SELECT id, username, total_points FROM players WHERE is_admin=FALSE ORDER BY total_points DESC'
  );
  const predStats = await query(
    'SELECT player_id, points_earned FROM predictions WHERE points_earned > 0'
  );
  const stats = {};
  predStats.forEach(p => {
    if (!stats[p.player_id]) stats[p.player_id] = { exact: 0, correct: 0 };
    if (p.points_earned === 3) stats[p.player_id].exact++;
    if (p.points_earned === 1) stats[p.player_id].correct++;
  });
  res.json({ data: players, stats });
});

// ── API: Admin stats ──────────────────────────────────────────
app.get('/api/admin/stats', async (req, res) => {
  const [{ count: players }]     = await query("SELECT COUNT(*) FROM players WHERE is_admin=FALSE");
  const [{ count: predictions }] = await query("SELECT COUNT(*) FROM predictions");
  const [{ count: completed }]   = await query("SELECT COUNT(*) FROM fixtures WHERE status='completed'");
  res.json({
    players:     parseInt(players),
    predictions: parseInt(predictions),
    completed:   parseInt(completed),
  });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, async () => {
  try {
    await pool.query('SELECT 1'); // test connection
    console.log(`\n🔴 Arsenal Predictor running at http://localhost:${PORT}`);
    console.log('✅ Connected to PostgreSQL\n');
  } catch (err) {
    console.error('❌ Could not connect to PostgreSQL:', err.message);
    console.error('   Check your host/port/database/user/password in server.js\n');
  }
});
