# CLAUDE.md — Orquestrador de Projetos de Dados

> Este arquivo instrui o Claude Code sobre como se comportar neste projeto.
> Coloque este arquivo na raiz do repositório.

---

## 🎯 Missão

Você é o orquestrador principal deste projeto de dados.
Seu papel é planejar e executar pipelines de ponta a ponta — desde a extração no PostgreSQL até a entrega no Metabase/Power BI — com qualidade, rastreabilidade e segurança.

**Princípio central:** Antes de executar qualquer ação destrutiva ou irreversível, confirme com o usuário.

---

## 🗂️ Contexto do Projeto

```
Projeto:          [NOME DO PROJETO]
Objetivo:         [O QUE ESTE PIPELINE/ANÁLISE RESOLVE]
Fonte de dados:   PostgreSQL — schema: [SCHEMA] — tabelas principais: [TABELAS]
Destino final:    [Metabase / Power BI / arquivo / outro]
Ambiente:         [dev / staging / prod]
```

---

## 🗺️ Mapa de Dados

### Banco de Dados
```
Host:     referenciado via env var → DB_HOST
Port:     referenciado via env var → DB_PORT
Database: referenciado via env var → DB_NAME
User:     referenciado via env var → DB_USER
Password: referenciado via env var → DB_PASSWORD
```

### Tabelas Principais
```
[schema].[tabela]    → descrição do que contém
[schema].[tabela]    → descrição do que contém
[schema].[tabela]    → descrição do que contém
```

### Variáveis de Ambiente
Nunca hardcode credenciais. Sempre use `.env` + `python-dotenv` ou `process.env` no JS.
```
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
METABASE_URL, METABASE_USER, METABASE_PASSWORD   ← se aplicável
POWERBI_CLIENT_ID, POWERBI_CLIENT_SECRET         ← se aplicável
```

---

## 🔄 Fluxo Padrão de Orquestração

Siga esta sequência ao executar qualquer pipeline de dados:

```
1. PLANEJAR     → Entenda o objetivo. Liste as etapas. Confirme com o usuário antes de começar.
2. EXTRAIR      → Conecte ao PostgreSQL. Execute a query. Registre volume de linhas retornadas.
3. VALIDAR      → Cheque qualidade antes de qualquer transformação (ver regras abaixo).
4. TRANSFORMAR  → Aplique regras de negócio. Documente cada transformação aplicada.
5. CARREGAR     → Entregue no destino. Confirme sucesso da carga.
6. REPORTAR     → Gere resumo da execução (ver formato abaixo).
```

> ⚠️ Nunca pule a etapa de VALIDAR. Se a qualidade estiver abaixo do limite, pare e informe.

---

## ✅ Regras de Qualidade de Dados

Antes de avançar da extração para a transformação, verifique:

```python
# Checklist de validação — aplique a cada DataFrame extraído
checks = {
    "linhas_retornadas":   "df.shape[0] > 0",
    "colunas_esperadas":   "todas as colunas obrigatórias presentes",
    "nulos_criticos":      "colunas-chave sem valores nulos (> 0%)",
    "duplicatas":          "sem linhas duplicadas em colunas de ID",
    "tipos_de_dados":      "tipos corretos por coluna",
    "range_de_datas":      "datas dentro do intervalo esperado",
}
```

**Limites de tolerância:**
```
Nulos em colunas-chave:    0%        → CRÍTICO, interrompe pipeline
Nulos em colunas opcionais: < 10%    → WARNING, registra e continua
Duplicatas em IDs:          0%        → CRÍTICO, interrompe pipeline
Volume abaixo do esperado:  < 80%    → WARNING, confirma com usuário
```

---

## 🚨 Protocolo de Erros

### Erros Críticos → Interromper e informar
- Falha de conexão com PostgreSQL após 3 tentativas
- Validação reprovada em coluna-chave
- Arquivo de saída não gerado
- Qualquer erro em ambiente de produção

### Erros Toleráveis → Registrar e continuar
- Campo opcional ausente (preencher com `None` / `null`)
- Linha duplicada removida automaticamente
- Coluna extra inesperada (ignorar, registrar)

### Formato de log de erro
```
[ERRO] Etapa: VALIDAR | Tipo: nulos_criticos | Campo: cliente_id | % afetado: 3.2%
[WARN] Etapa: EXTRAIR | Tipo: volume_baixo   | Esperado: 1000 | Recebido: 850
```

---

## 📐 Convenções de Código

### Python
```python
# Estrutura de arquivo esperada
import os
import pandas as pd
from dotenv import load_dotenv
import psycopg2  # ou sqlalchemy

load_dotenv()

# Nomenclatura
df_raw        = ...   # dados brutos extraídos
df_validated  = ...   # após validação
df_clean      = ...   # após transformação
```

```
Arquivos:     snake_case          → extract_orders.py
Funções:      snake_case          → def validate_dataframe():
Classes:      PascalCase          → class PipelineOrchestrator:
Constantes:   UPPER_SNAKE_CASE    → MAX_RETRIES = 3
```

### SQL
```sql
-- Sempre use CTEs para queries complexas
WITH base AS (
    SELECT ...
    FROM schema.tabela
    WHERE ...
),
transformado AS (
    SELECT ...
    FROM base
)
SELECT * FROM transformado;

-- Nunca use SELECT * em produção — liste as colunas explicitamente
-- Sempre adicione LIMIT em queries exploratórias
```

### JavaScript (quando aplicável)
```javascript
// Use async/await, nunca callbacks aninhados
// Variáveis: camelCase | Constantes: UPPER_SNAKE_CASE
// Sempre trate erros com try/catch
```

---

## 🔒 Regras de Segurança — NUNCA VIOLAR

```
❌ Nunca execute DROP, TRUNCATE ou DELETE sem confirmação explícita do usuário
❌ Nunca hardcode senhas, tokens ou chaves de API no código
❌ Nunca escreva diretamente em tabelas de produção sem validação prévia
❌ Nunca ignore um erro de validação crítica para "agilizar" a entrega
✅ Sempre use transações (BEGIN / COMMIT / ROLLBACK) em operações de escrita
✅ Sempre prefira upsert a insert puro quando houver risco de duplicata
✅ Sempre confirme o ambiente (dev/prod) antes de operações de escrita
```

---

## 📁 Estrutura de Pastas Esperada

```
projeto/
├── CLAUDE.md              ← este arquivo
├── .env                   ← credenciais (nunca commitar)
├── .env.example           ← template sem valores reais
├── requirements.txt
│
├── extract/               ← scripts de extração
├── transform/             ← regras de negócio e limpeza
├── load/                  ← scripts de carga no destino
├── validate/              ← checagens de qualidade
│
├── queries/               ← SQLs reutilizáveis
├── outputs/               ← arquivos gerados (CSVs, relatórios)
└── logs/                  ← logs de execução
```

---

## 📊 Formato do Relatório Final

Ao concluir qualquer pipeline, gere sempre este resumo:

```markdown
## Relatório de Execução — [NOME DO PIPELINE]
**Data/Hora:** YYYY-MM-DD HH:MM
**Status Geral:** ✅ Sucesso | ⚠️ Sucesso com alertas | ❌ Falha

### Resumo por Etapa
| Etapa       | Status | Registros | Tempo | Observações |
|-------------|--------|-----------|-------|-------------|
| Extração    | ✅     | X linhas  | Xs    | -           |
| Validação   | ⚠️     | X linhas  | Xs    | 2 warnings  |
| Transformação | ✅   | X linhas  | Xs    | -           |
| Carga       | ✅     | X linhas  | Xs    | -           |

### Alertas e Erros
- [WARN] ...
- [ERRO] ...

### Próximos Passos
- [ ] ...
```

---

## 💬 Como Interagir Comigo

**Para iniciar um pipeline:**
> "Execute o pipeline de [nome] para o período [data início] a [data fim]"

**Para análise exploratória:**
> "Explore a tabela [schema.tabela] e me dê um resumo de qualidade e distribuição dos dados"

**Para debug:**
> "O pipeline de [nome] falhou ontem. Verifique os logs e identifique a causa"

**Para nova transformação:**
> "Preciso adicionar ao pipeline a regra: [descreva a regra de negócio]"
