#!/bin/bash
# ============================================================
# init-prod-db.sh
# Roda UMA VEZ antes de subir docker-compose.producao.yml
# Cria o banco metabase e o usuário read-only no postgres externo
# ============================================================

set -e

# Carrega variáveis do .env
if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

: "${POSTGRES_HOST:?Variável POSTGRES_HOST não definida}"
: "${POSTGRES_USER:?Variável POSTGRES_USER não definida}"
: "${POSTGRES_PASSWORD:?Variável POSTGRES_PASSWORD não definida}"
: "${POSTGRES_DB:?Variável POSTGRES_DB não definida}"

export PGPASSWORD="$POSTGRES_PASSWORD"

echo "→ Conectando em $POSTGRES_HOST como $POSTGRES_USER..."

psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<EOF
-- Cria banco do Metabase se não existir
SELECT 'CREATE DATABASE metabase TEMPLATE template0'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'metabase')\gexec

-- Cria usuário read-only para o Metabase acessar dados da aplicação
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_reader') THEN
    CREATE USER metabase_reader WITH PASSWORD 'metabase_readonly_2024';
    GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO metabase_reader;
    GRANT USAGE ON SCHEMA public TO metabase_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO metabase_reader;
    RAISE NOTICE 'Usuário metabase_reader criado com sucesso.';
  ELSE
    RAISE NOTICE 'Usuário metabase_reader já existe, pulando.';
  END IF;
END
\$\$;
EOF

echo "✓ Bancos e permissões configurados com sucesso."
echo ""
echo "Agora suba o ambiente com:"
echo "  docker compose -f docker-compose.producao.yml up -d"
