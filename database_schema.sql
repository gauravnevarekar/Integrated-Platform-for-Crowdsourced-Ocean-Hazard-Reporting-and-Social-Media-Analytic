-- Enable PostGIS extension for spatial data operations
CREATE EXTENSION IF NOT EXISTS postgis;
-- Enable UUID extension for globally unique identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-------------------------------------------------------------------------------
-- ENUMS
-------------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM (
    'public', 
    'verified_reporter', 
    'authority', 
    'admin'
);

CREATE TYPE hazard_status AS ENUM (
    'reported',     -- Initial submission
    'under_review', -- Being checked by authority
    'verified',     -- Confirmed valid
    'resolved',     -- Hazard cleared/handled
    'rejected'      -- False report/spam
);

CREATE TYPE severity_level AS ENUM (
    'low', 
    'medium', 
    'high', 
    'critical'
);

CREATE TYPE social_platform AS ENUM (
    'twitter', 
    'instagram', 
    'facebook', 
    'other'
);

-------------------------------------------------------------------------------
-- 1. USERS TABLE
-------------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'public',
    trust_score DECIMAL(5,2) DEFAULT 50.00 CHECK (trust_score >= 0 AND trust_score <= 100), -- Base score affecting report weight
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-------------------------------------------------------------------------------
-- 2. HAZARD CATEGORIES TABLE
-------------------------------------------------------------------------------
CREATE TABLE hazard_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'oil_spill', 'rough_seas', 'debris'
    description TEXT,
    base_severity severity_level DEFAULT 'medium',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hazard_categories_name ON hazard_categories(name);

-- Insert default categories
INSERT INTO hazard_categories (name, description, base_severity) VALUES
    ('oil_spill', 'Oil or chemical deposits on the water surface', 'critical'),
    ('rough_seas', 'Unusually high waves or dangerous currents', 'high'),
    ('debris', 'Floating garbage, ghost nets, or navigational hazards', 'medium'),
    ('wildlife_entanglement', 'Marine life caught in nets or debris', 'high'),
    ('chemical_spill', 'Toxic chemical waste release', 'critical'),
    ('rogue_wave', 'Unexpected surface wave of extreme size', 'critical'),
    ('jellyfish_bloom', 'Large concentration of jellyfish (e.g., box jellyfish, man o'' war)', 'medium');

-------------------------------------------------------------------------------
-- 3. HAZARD REPORTS (Crowdsourced from Users)
-------------------------------------------------------------------------------
CREATE TABLE hazard_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    category_id INT REFERENCES hazard_categories(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Spatial Data column mapped to SRID 4326 (WGS 84 GPS coordinates)
    location GEOMETRY(Point, 4326) NOT NULL, 
    -- Extracted lat/lon for easy non-spatial queries parsing if needed
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    severity severity_level NOT NULL,
    status hazard_status DEFAULT 'reported',
    
    -- Algorithmic confidence based on user trust and corroborations
    trust_score DECIMAL(5,2) DEFAULT 0.00, 
    
    photos JSONB DEFAULT '[]', -- JSON array of media URLs
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crucial Spatial Index for incredibly fast bounding box / radius queries
CREATE INDEX idx_hazard_reports_location ON hazard_reports USING GIST (location);
CREATE INDEX idx_hazard_reports_status ON hazard_reports(status);
CREATE INDEX idx_hazard_reports_category ON hazard_reports(category_id);
CREATE INDEX idx_hazard_reports_reported_at ON hazard_reports(reported_at);

-------------------------------------------------------------------------------
-- 4. SOCIAL MEDIA POSTS
-------------------------------------------------------------------------------
CREATE TABLE social_media_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform social_platform NOT NULL,
    social_handle VARCHAR(255),
    raw_content TEXT NOT NULL,
    
    -- NLP extraction outputs
    extracted_entities JSONB, -- {"locations": ["Miami Beach"], "tags": ["#oilspill"]}
    nlp_classification_id INT REFERENCES hazard_categories(id) ON DELETE SET NULL,
    confidence_score DECIMAL(5,2) CHECK (confidence_score >= 0 AND confidence_score <= 100),
    
    -- Resolved location from NLP mapping or attached metadata
    location GEOMETRY(Point, 4326), 
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Links social noise to a concrete system report
    linked_report_id UUID REFERENCES hazard_reports(id) ON DELETE SET NULL 
);

-- Spatial and standard Indexes for Social Posts
CREATE INDEX idx_social_posts_location ON social_media_posts USING GIST (location) WHERE location IS NOT NULL;
CREATE INDEX idx_social_posts_platform ON social_media_posts(platform);
CREATE INDEX idx_social_posts_posted_at ON social_media_posts(posted_at);

-------------------------------------------------------------------------------
-- 5. REPORT CORROBORATIONS
-------------------------------------------------------------------------------
-- Allows multiple users to confirm or deny the existence of a hazard
CREATE TABLE report_corroborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES hazard_reports(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    
    is_confirming BOOLEAN DEFAULT true, -- true = confirmed, false = fake report
    comments TEXT,
    
    -- The location of the user when confirming (to deter spoofing)
    location GEOMETRY(Point, 4326), 
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- A user can only corroborate a single report once
    CONSTRAINT unique_user_report_corroboration UNIQUE(report_id, user_id) 
);

CREATE INDEX idx_corroborations_report ON report_corroborations(report_id);

-------------------------------------------------------------------------------
-- 6. ALERT RULES
-------------------------------------------------------------------------------
-- Defines geofences and conditions under which a user/system wants to be notified
CREATE TABLE alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    rule_name VARCHAR(100) NOT NULL,
    
    category_id INT REFERENCES hazard_categories(id) ON DELETE CASCADE, -- NULL = Any
    min_severity severity_level DEFAULT 'low',
    
    -- Polygon representing the area they want alerts for (e.g., "Gulf of Mexico region")
    alert_area GEOMETRY(Polygon, 4326) NOT NULL,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_rules_area ON alert_rules USING GIST (alert_area);
CREATE INDEX idx_alert_rules_user ON alert_rules(user_id);

-------------------------------------------------------------------------------
-- 7. TRIGGERED ALERTS
-------------------------------------------------------------------------------
-- Audit log of notifications blasted out from Alert Rules
CREATE TABLE triggered_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID REFERENCES alert_rules(id) ON DELETE CASCADE NOT NULL,
    report_id UUID REFERENCES hazard_reports(id) ON DELETE CASCADE NOT NULL,
    
    delivery_status VARCHAR(50) DEFAULT 'delivered', -- e.g., 'failed', 'delivered'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_triggered_alerts_rule ON triggered_alerts(rule_id);
CREATE INDEX idx_triggered_alerts_report ON triggered_alerts(report_id);

-------------------------------------------------------------------------------
-- 8. AUDIT LOGS
-------------------------------------------------------------------------------
-- For compliance and tracing (e.g., when an admin rejects a report)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_name VARCHAR(100) NOT NULL, -- e.g., 'hazard_reports'
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,       -- e.g., 'STATUS_CHANGE', 'DELETE'
    performed_by UUID REFERENCES usezrs(id) ON DELETE SET NULL, -- Admin/Authority ID
    
    old_values JSONB, -- Record state before action
    new_values JSONB, -- Record state after action
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_name, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-------------------------------------------------------------------------------
-- TRIGGER: Auto-Update Updated_At Columns
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_modtime
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER update_reports_modtime
    BEFORE UPDATE ON hazard_reports
    FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
