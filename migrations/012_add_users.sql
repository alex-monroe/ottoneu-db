-- Create users table for authentication
CREATE TABLE users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  has_projections_access boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX idx_users_email ON users(email);

-- Insert admin user (bcrypt hash of 'ottoneu2024')
INSERT INTO users (id, email, password_hash, is_admin, has_projections_access)
VALUES (
  gen_random_uuid(), 'alexrmonroe@gmail.com',
  '$2b$12$3hfoFM3MTcxj4m.vVPtoWek6xriG25hagIpFmz1WrYfamIxSKik6q',
  true, true
);

-- Add user_id to surplus_adjustments
ALTER TABLE surplus_adjustments ADD COLUMN user_id uuid REFERENCES users(id);
ALTER TABLE surplus_adjustments DROP CONSTRAINT surplus_adjustments_player_id_league_id_key;
UPDATE surplus_adjustments SET user_id = (SELECT id FROM users WHERE email = 'alexrmonroe@gmail.com');
ALTER TABLE surplus_adjustments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE surplus_adjustments ADD CONSTRAINT surplus_adjustments_player_league_user_key UNIQUE(player_id, league_id, user_id);

-- Add user_id to arbitration_plans
ALTER TABLE arbitration_plans ADD COLUMN user_id uuid REFERENCES users(id);
ALTER TABLE arbitration_plans DROP CONSTRAINT arbitration_plans_league_id_name_key;
UPDATE arbitration_plans SET user_id = (SELECT id FROM users WHERE email = 'alexrmonroe@gmail.com');
ALTER TABLE arbitration_plans ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE arbitration_plans ADD CONSTRAINT arbitration_plans_league_name_user_key UNIQUE(league_id, name, user_id);
