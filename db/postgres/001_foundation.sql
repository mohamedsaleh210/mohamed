BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS sanad;
SET search_path TO sanad, public;

CREATE TYPE tenant_status AS ENUM ('pending','trial','active','past_due','suspended','closed');
CREATE TYPE request_status AS ENUM (
  'draft','submitted','initial_review','missing_information','ready_for_quote',
  'quote_sent','quote_revision','quote_rejected','quote_accepted','awaiting_advance',
  'in_progress','completed','closed','cancelled','refund_review','disputed'
);
CREATE TYPE visibility_scope AS ENUM ('public','authenticated','tenant','private');

CREATE TABLE countries (
  code char(2) PRIMARY KEY,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  default_currency char(3) NOT NULL,
  default_timezone text NOT NULL,
  supports_hijri boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint,
  slug text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  public_name_ar text,
  public_name_en text,
  country_code char(2) NOT NULL REFERENCES countries(code),
  status tenant_status NOT NULL DEFAULT 'pending',
  base_currency char(3) NOT NULL,
  timezone text NOT NULL,
  locale_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hostname citext NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('subdomain','path','custom')),
  verified_at timestamptz,
  primary_domain boolean NOT NULL DEFAULT false
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint,
  email citext,
  phone text,
  password_hash text,
  display_name text NOT NULL,
  locale text NOT NULL DEFAULT 'ar',
  active boolean NOT NULL DEFAULT true,
  two_factor_required boolean NOT NULL DEFAULT false,
  verified_email_at timestamptz,
  verified_phone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (email),
  UNIQUE NULLS NOT DISTINCT (phone)
);

CREATE TABLE tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  financial_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id)
);

CREATE TABLE service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES service_categories(id),
  slug text NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  UNIQUE NULLS NOT DISTINCT (owner_tenant_id,slug)
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint,
  owner_tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES service_categories(id),
  slug text NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','hidden','archived')),
  audience text[] NOT NULL DEFAULT '{}',
  countries char(2)[] NOT NULL DEFAULT '{}',
  pricing_mode text NOT NULL DEFAULT 'quote' CHECK (pricing_mode IN ('quote','fixed','starting_from','free')),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflow jsonb NOT NULL DEFAULT '[]'::jsonb,
  form_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  commission_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (owner_tenant_id,slug)
);

CREATE TABLE service_versions (
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id,version)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  legacy_id bigint,
  user_id uuid REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('individual','organization','representative')),
  name text NOT NULL,
  email citext,
  phone text,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  legacy_id bigint,
  reference text NOT NULL UNIQUE,
  service_id uuid NOT NULL REFERENCES services(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  country_code char(2) NOT NULL REFERENCES countries(code),
  status request_status NOT NULL DEFAULT 'submitted',
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_visibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE request_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  from_status request_status,
  to_status request_status NOT NULL,
  reason text,
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approval','sent','revision','accepted','rejected','expired')),
  valid_until date,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id,version)
);

CREATE TABLE quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('office_fee','government_fee','external_fee','tax','discount')),
  description_ar text NOT NULL,
  description_en text,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_amount numeric(18,2) NOT NULL,
  tax_rate numeric(7,4) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE cms_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  page_key text NOT NULL DEFAULT 'home',
  section_key text NOT NULL,
  template_key text NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  country_code char(2) REFERENCES countries(code),
  audience text,
  content_ar jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_en jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE NULLS NOT DISTINCT (tenant_id,page_key,section_key,country_code,audience)
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip inet,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX requests_tenant_status_idx ON requests(tenant_id,status,created_at DESC);
CREATE INDEX customers_tenant_phone_idx ON customers(tenant_id,phone);
CREATE INDEX audit_tenant_time_idx ON audit_events(tenant_id,occurred_at DESC);
CREATE INDEX services_category_status_idx ON services(category_id,status);

CREATE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true),'')::uuid
$$;

CREATE FUNCTION is_platform_owner() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.platform_owner', true),'')::boolean,false)
$$;

ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_domains_isolation ON tenant_domains
  USING (is_platform_owner() OR tenant_id=current_tenant_id())
  WITH CHECK (is_platform_owner() OR tenant_id=current_tenant_id());
CREATE POLICY memberships_isolation ON tenant_memberships
  USING (is_platform_owner() OR tenant_id=current_tenant_id())
  WITH CHECK (is_platform_owner() OR tenant_id=current_tenant_id());
CREATE POLICY customers_isolation ON customers
  USING (is_platform_owner() OR tenant_id=current_tenant_id())
  WITH CHECK (is_platform_owner() OR tenant_id=current_tenant_id());
CREATE POLICY requests_isolation ON requests
  USING (is_platform_owner() OR tenant_id=current_tenant_id())
  WITH CHECK (is_platform_owner() OR tenant_id=current_tenant_id());
CREATE POLICY request_history_isolation ON request_status_history
  USING (is_platform_owner() OR tenant_id=current_tenant_id())
  WITH CHECK (is_platform_owner() OR tenant_id=current_tenant_id());
CREATE POLICY quotes_isolation ON quotes
  USING (is_platform_owner() OR tenant_id=current_tenant_id())
  WITH CHECK (is_platform_owner() OR tenant_id=current_tenant_id());
CREATE POLICY quote_items_isolation ON quote_items
  USING (is_platform_owner() OR tenant_id=current_tenant_id())
  WITH CHECK (is_platform_owner() OR tenant_id=current_tenant_id());
CREATE POLICY cms_sections_isolation ON cms_sections
  USING (is_platform_owner() OR tenant_id IS NULL OR tenant_id=current_tenant_id())
  WITH CHECK (is_platform_owner() OR tenant_id=current_tenant_id());
CREATE POLICY audit_events_read ON audit_events
  FOR SELECT USING (is_platform_owner() OR tenant_id=current_tenant_id());
CREATE POLICY audit_events_insert ON audit_events
  FOR INSERT WITH CHECK (is_platform_owner() OR tenant_id=current_tenant_id());

INSERT INTO countries(code,name_ar,name_en,default_currency,default_timezone,supports_hijri)
VALUES
  ('EG','مصر','Egypt','EGP','Africa/Cairo',false),
  ('SA','السعودية','Saudi Arabia','SAR','Asia/Riyadh',true)
ON CONFLICT (code) DO NOTHING;

COMMIT;
