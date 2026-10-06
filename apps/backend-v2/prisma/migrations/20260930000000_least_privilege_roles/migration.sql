-- Create runtime roles if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'omnix_backend_runtime') THEN
    CREATE ROLE omnix_backend_runtime WITH LOGIN PASSWORD 'backend_runtime_secret';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'omnix_python_runtime') THEN
    CREATE ROLE omnix_python_runtime WITH LOGIN PASSWORD 'python_runtime_secret';
  END IF;
END
$$;

-- Grant usage on public schema
GRANT USAGE ON SCHEMA public TO omnix_backend_runtime;
GRANT USAGE ON SCHEMA public TO omnix_python_runtime;

-- Restrict Python to required CRM reads and necessary knowledge writes
-- Reads
GRANT SELECT ON TABLE conversations TO omnix_python_runtime;
GRANT SELECT ON TABLE leads TO omnix_python_runtime;
GRANT SELECT ON TABLE messages TO omnix_python_runtime;
GRANT SELECT ON TABLE organization_experiences TO omnix_python_runtime;
GRANT SELECT ON TABLE organization_battlecards TO omnix_python_runtime;
GRANT SELECT ON TABLE organization_knowledge TO omnix_python_runtime;

-- Writes (necessary knowledge writes + embedding updates)
GRANT INSERT, DELETE ON TABLE organization_knowledge TO omnix_python_runtime;
GRANT UPDATE (embedding) ON TABLE organization_experiences TO omnix_python_runtime;

-- Give backend runtime broad read/write but not superuser/ownership
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO omnix_backend_runtime;

-- Ensure future tables get the same backend runtime privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO omnix_backend_runtime;
