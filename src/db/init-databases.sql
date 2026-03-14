-- ============================================================
-- Inicialização dos bancos de dados auxiliares
-- Executado automaticamente pelo PostgreSQL na primeira vez
-- que o container sobe (diretório /docker-entrypoint-initdb.d/)
-- ============================================================

-- Banco do Metabase (dashboards, questões e configurações)
SELECT 'CREATE DATABASE metabase TEMPLATE template0'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'metabase')\gexec

-- Usuário read-only para o Metabase acessar os dados da aplicação
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_reader') THEN
    CREATE USER metabase_reader WITH PASSWORD 'metabase_readonly_2024';
    GRANT CONNECT ON DATABASE postgres TO metabase_reader;
    GRANT USAGE ON SCHEMA public TO metabase_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO metabase_reader;
  END IF;
END
$$;
