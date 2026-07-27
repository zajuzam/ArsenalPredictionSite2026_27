-- ============================================================
-- Arsenal Predictor — Supabase Schema (Clean Install)
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Step 1: Clean slate (safe to re-run at any time)
DROP TABLE IF EXISTS predictions CASCADE;
DROP TABLE IF EXISTS fixtures    CASCADE;
DROP TABLE IF EXISTS players     CASCADE;
DROP TABLE IF EXISTS seasons     CASCADE;

-- Step 2: Tables
CREATE TABLE seasons (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  year       INTEGER     NOT NULL,
  is_active  BOOLEAN     DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fixtures (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id  UUID        REFERENCES seasons(id) ON DELETE CASCADE,
  match_week INTEGER     NOT NULL,
  home_team  TEXT        NOT NULL,
  away_team  TEXT        NOT NULL,
  match_date TIMESTAMPTZ,
  home_score INTEGER,
  away_score INTEGER,
  status     TEXT        DEFAULT 'scheduled'
               CHECK (status IN ('scheduled','completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE players (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  username     TEXT        UNIQUE NOT NULL,
  pin_hash     TEXT        NOT NULL,
  total_points INTEGER     DEFAULT 0,
  is_admin     BOOLEAN     DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE predictions (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id      UUID        REFERENCES players(id)  ON DELETE CASCADE,
  fixture_id     UUID        REFERENCES fixtures(id) ON DELETE CASCADE,
  predicted_home INTEGER     NOT NULL,
  predicted_away INTEGER     NOT NULL,
  points_earned  INTEGER     DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, fixture_id)
);

-- Step 3: Indexes
CREATE INDEX idx_fixtures_season  ON fixtures(season_id);
CREATE INDEX idx_pred_player      ON predictions(player_id);
CREATE INDEX idx_pred_fixture     ON predictions(fixture_id);

-- Step 4: Disable RLS for POC
ALTER TABLE seasons     DISABLE ROW LEVEL SECURITY;
ALTER TABLE fixtures    DISABLE ROW LEVEL SECURITY;
ALTER TABLE players     DISABLE ROW LEVEL SECURITY;
ALTER TABLE predictions DISABLE ROW LEVEL SECURITY;

-- Step 5: Seed 2026/27 season
INSERT INTO seasons (name, year, is_active) VALUES ('2026/27', 2026, true);

DO $$
DECLARE s UUID;
BEGIN
  SELECT id INTO s FROM seasons WHERE year = 2026;

  INSERT INTO fixtures (season_id, match_week, home_team, away_team, match_date) VALUES
  (s,  1, 'Arsenal',               'Coventry City',         '2026-08-21 20:00:00+01'),
  (s,  2, 'Aston Villa',           'Arsenal',               '2026-08-29 15:00:00+01'),
  (s,  3, 'Arsenal',               'Chelsea',               '2026-09-05 15:00:00+01'),
  (s,  4, 'Sunderland',            'Arsenal',               '2026-09-12 15:00:00+01'),
  (s,  5, 'Brighton & Hove Albion','Arsenal',               '2026-09-19 15:00:00+01'),
  (s,  6, 'Arsenal',               'Leeds United',          '2026-10-10 15:00:00+01'),
  (s,  7, 'Nottingham Forest',     'Arsenal',               '2026-10-17 15:00:00+01'),
  (s,  8, 'Arsenal',               'Everton',               '2026-10-24 15:00:00+01'),
  (s,  9, 'Liverpool',             'Arsenal',               '2026-10-31 15:00:00+00'),
  (s, 10, 'Arsenal',               'Hull City',             '2026-11-07 15:00:00+00'),
  (s, 11, 'Newcastle United',      'Arsenal',               '2026-11-21 15:00:00+00'),
  (s, 12, 'Arsenal',               'Manchester City',       '2026-11-28 15:00:00+00'),
  (s, 13, 'Brentford',             'Arsenal',               '2026-12-02 20:00:00+00'),
  (s, 14, 'Tottenham Hotspur',     'Arsenal',               '2026-12-05 15:00:00+00'),
  (s, 15, 'Arsenal',               'Bournemouth',           '2026-12-12 15:00:00+00'),
  (s, 16, 'Arsenal',               'Manchester United',     '2026-12-19 15:00:00+00'),
  (s, 17, 'Crystal Palace',        'Arsenal',               '2026-12-26 15:00:00+00'),
  (s, 18, 'Fulham',                'Arsenal',               '2026-12-30 20:00:00+00'),
  (s, 19, 'Arsenal',               'Ipswich Town',          '2027-01-02 15:00:00+00'),
  (s, 20, 'Arsenal',               'Brentford',             '2027-01-06 20:00:00+00'),
  (s, 21, 'Hull City',             'Arsenal',               '2027-01-16 15:00:00+00'),
  (s, 22, 'Arsenal',               'Newcastle United',      '2027-01-23 15:00:00+00'),
  (s, 23, 'Manchester City',       'Arsenal',               '2027-01-30 15:00:00+00'),
  (s, 24, 'Arsenal',               'Liverpool',             '2027-02-06 15:00:00+00'),
  (s, 25, 'Ipswich Town',          'Arsenal',               '2027-02-10 20:00:00+00'),
  (s, 26, 'Arsenal',               'Fulham',                '2027-02-20 15:00:00+00'),
  (s, 27, 'Manchester United',     'Arsenal',               '2027-02-27 15:00:00+00'),
  (s, 28, 'Arsenal',               'Crystal Palace',        '2027-03-03 20:00:00+00'),
  (s, 29, 'Chelsea',               'Arsenal',               '2027-03-13 15:00:00+00'),
  (s, 30, 'Arsenal',               'Sunderland',            '2027-03-20 15:00:00+00'),
  (s, 31, 'Coventry City',         'Arsenal',               '2027-04-10 15:00:00+01'),
  (s, 32, 'Arsenal',               'Aston Villa',           '2027-04-17 15:00:00+01'),
  (s, 33, 'Bournemouth',           'Arsenal',               '2027-04-24 15:00:00+01'),
  (s, 34, 'Arsenal',               'Tottenham Hotspur',     '2027-05-01 15:00:00+01'),
  (s, 35, 'Leeds United',          'Arsenal',               '2027-05-08 15:00:00+01'),
  (s, 36, 'Arsenal',               'Nottingham Forest',     '2027-05-15 15:00:00+01'),
  (s, 37, 'Everton',               'Arsenal',               '2027-05-23 15:00:00+01'),
  (s, 38, 'Arsenal',               'Brighton & Hove Albion','2027-05-30 16:00:00+01');
END $$;

-- ============================================================
-- NEW SEASON TEMPLATE (run each summer)
-- ============================================================
-- DROP TABLE IF EXISTS predictions CASCADE;
-- DROP TABLE IF EXISTS fixtures CASCADE;
-- UPDATE seasons SET is_active = false;
-- INSERT INTO seasons (name, year, is_active) VALUES ('2027/28', 2027, true);
-- Then re-insert fixtures for the new season.
