-- ============================================================
--  Arsenal Predictor — PostgreSQL Schema + Seed Data
--  Run this once in your local Postgres database.
--
--  Steps:
--  1. Open psql or pgAdmin and connect to your DB
--  2. Run: \i path/to/schema.sql   (psql)
--         or paste the whole file into pgAdmin's Query Tool
-- ============================================================

-- ── Tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seasons (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  year       INTEGER NOT NULL,
  is_active  BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixtures (
  id         TEXT PRIMARY KEY,
  season_id  TEXT REFERENCES seasons(id),
  match_week INTEGER NOT NULL,
  home_team  TEXT NOT NULL,
  away_team  TEXT NOT NULL,
  match_date TIMESTAMPTZ,
  home_score INTEGER,
  away_score INTEGER,
  status     TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id           TEXT PRIMARY KEY,
  username     TEXT UNIQUE NOT NULL,
  pin_hash     TEXT NOT NULL,
  total_points INTEGER DEFAULT 0,
  is_admin     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS predictions (
  id             TEXT PRIMARY KEY,
  player_id      TEXT REFERENCES players(id),
  fixture_id     TEXT REFERENCES fixtures(id),
  predicted_home INTEGER NOT NULL,
  predicted_away INTEGER NOT NULL,
  points_earned  INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, fixture_id)
);

-- ── Seed: 2026/27 Season ──────────────────────────────────────

INSERT INTO seasons (id, name, year, is_active) VALUES
  ('season-2026-27', '2026/27', 2026, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── Seed: All 38 Arsenal Fixtures ────────────────────────────

INSERT INTO fixtures (id, season_id, match_week, home_team, away_team, match_date) VALUES
  ('fix-01', 'season-2026-27',  1, 'Arsenal',                'Coventry City',          '2026-08-21T20:00:00+01:00'),
  ('fix-02', 'season-2026-27',  2, 'Aston Villa',            'Arsenal',                '2026-08-29T15:00:00+01:00'),
  ('fix-03', 'season-2026-27',  3, 'Arsenal',                'Chelsea',                '2026-09-05T15:00:00+01:00'),
  ('fix-04', 'season-2026-27',  4, 'Sunderland',             'Arsenal',                '2026-09-12T15:00:00+01:00'),
  ('fix-05', 'season-2026-27',  5, 'Brighton & Hove Albion', 'Arsenal',                '2026-09-19T15:00:00+01:00'),
  ('fix-06', 'season-2026-27',  6, 'Arsenal',                'Leeds United',           '2026-10-10T15:00:00+01:00'),
  ('fix-07', 'season-2026-27',  7, 'Nottingham Forest',      'Arsenal',                '2026-10-17T15:00:00+01:00'),
  ('fix-08', 'season-2026-27',  8, 'Arsenal',                'Everton',                '2026-10-24T15:00:00+01:00'),
  ('fix-09', 'season-2026-27',  9, 'Liverpool',              'Arsenal',                '2026-10-31T15:00:00+00:00'),
  ('fix-10', 'season-2026-27', 10, 'Arsenal',                'Hull City',              '2026-11-07T15:00:00+00:00'),
  ('fix-11', 'season-2026-27', 11, 'Newcastle United',       'Arsenal',                '2026-11-21T15:00:00+00:00'),
  ('fix-12', 'season-2026-27', 12, 'Arsenal',                'Manchester City',        '2026-11-28T15:00:00+00:00'),
  ('fix-13', 'season-2026-27', 13, 'Brentford',              'Arsenal',                '2026-12-02T20:00:00+00:00'),
  ('fix-14', 'season-2026-27', 14, 'Tottenham Hotspur',      'Arsenal',                '2026-12-05T15:00:00+00:00'),
  ('fix-15', 'season-2026-27', 15, 'Arsenal',                'Bournemouth',            '2026-12-12T15:00:00+00:00'),
  ('fix-16', 'season-2026-27', 16, 'Arsenal',                'Manchester United',      '2026-12-19T15:00:00+00:00'),
  ('fix-17', 'season-2026-27', 17, 'Crystal Palace',         'Arsenal',                '2026-12-26T15:00:00+00:00'),
  ('fix-18', 'season-2026-27', 18, 'Fulham',                 'Arsenal',                '2026-12-30T20:00:00+00:00'),
  ('fix-19', 'season-2026-27', 19, 'Arsenal',                'Ipswich Town',           '2027-01-02T15:00:00+00:00'),
  ('fix-20', 'season-2026-27', 20, 'Arsenal',                'Brentford',              '2027-01-06T20:00:00+00:00'),
  ('fix-21', 'season-2026-27', 21, 'Hull City',              'Arsenal',                '2027-01-16T15:00:00+00:00'),
  ('fix-22', 'season-2026-27', 22, 'Arsenal',                'Newcastle United',       '2027-01-23T15:00:00+00:00'),
  ('fix-23', 'season-2026-27', 23, 'Manchester City',        'Arsenal',                '2027-01-30T15:00:00+00:00'),
  ('fix-24', 'season-2026-27', 24, 'Arsenal',                'Liverpool',              '2027-02-06T15:00:00+00:00'),
  ('fix-25', 'season-2026-27', 25, 'Ipswich Town',           'Arsenal',                '2027-02-10T20:00:00+00:00'),
  ('fix-26', 'season-2026-27', 26, 'Arsenal',                'Fulham',                 '2027-02-20T15:00:00+00:00'),
  ('fix-27', 'season-2026-27', 27, 'Manchester United',      'Arsenal',                '2027-02-27T15:00:00+00:00'),
  ('fix-28', 'season-2026-27', 28, 'Arsenal',                'Crystal Palace',         '2027-03-03T20:00:00+00:00'),
  ('fix-29', 'season-2026-27', 29, 'Chelsea',                'Arsenal',                '2027-03-13T15:00:00+00:00'),
  ('fix-30', 'season-2026-27', 30, 'Arsenal',                'Sunderland',             '2027-03-20T15:00:00+00:00'),
  ('fix-31', 'season-2026-27', 31, 'Coventry City',          'Arsenal',                '2027-04-10T15:00:00+01:00'),
  ('fix-32', 'season-2026-27', 32, 'Arsenal',                'Aston Villa',            '2027-04-17T15:00:00+01:00'),
  ('fix-33', 'season-2026-27', 33, 'Bournemouth',            'Arsenal',                '2027-04-24T15:00:00+01:00'),
  ('fix-34', 'season-2026-27', 34, 'Arsenal',                'Tottenham Hotspur',      '2027-05-01T15:00:00+01:00'),
  ('fix-35', 'season-2026-27', 35, 'Leeds United',           'Arsenal',                '2027-05-08T15:00:00+01:00'),
  ('fix-36', 'season-2026-27', 36, 'Arsenal',                'Nottingham Forest',      '2027-05-15T15:00:00+01:00'),
  ('fix-37', 'season-2026-27', 37, 'Everton',                'Arsenal',                '2027-05-23T15:00:00+01:00'),
  ('fix-38', 'season-2026-27', 38, 'Arsenal',                'Brighton & Hove Albion', '2027-05-30T16:00:00+01:00')
ON CONFLICT (id) DO NOTHING;
