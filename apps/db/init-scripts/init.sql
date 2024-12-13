DO $$ 
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_database WHERE datname = 'keycloak'
   ) THEN
      CREATE DATABASE keycloak;
   END IF;
END $$;

DO $$ 
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_database WHERE datname = 'backend'
   ) THEN
      CREATE DATABASE backend;
   END IF;
END $$;
