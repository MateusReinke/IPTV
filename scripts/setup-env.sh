#!/bin/sh
# Gera um .env com segredos aleatórios para subir com Docker Compose fora do
# Coolify (VPS, máquina local). No Coolify isso não é necessário: as variáveis
# SERVICE_* do docker-compose.yml são geradas pela própria plataforma.
#
#   ./scripts/setup-env.sh && docker compose up -d
#
# Rodar de novo não sobrescreve nada: trocar APP_ENCRYPTION_KEY tornaria os
# favoritos e o histórico já sincronizados ilegíveis.

set -eu

ENV_FILE="${1:-.env}"

if [ -f "$ENV_FILE" ]; then
  echo "$ENV_FILE ja existe - nada a fazer."
  echo "Para recomeçar do zero, apague o arquivo (e o volume do banco) antes."
  exit 0
fi

random() {
  # openssl quando disponível; senão o próprio Node, que já é dependência.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$1" | tr -d '\n=/+' | cut -c1-"$2"
  else
    node -e "process.stdout.write(require('crypto').randomBytes($1).toString('base64').replace(/[^A-Za-z0-9]/g,'').slice(0,$2))"
  fi
}

cat > "$ENV_FILE" <<EOF
# Gerado por scripts/setup-env.sh em $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Guarde este arquivo: APP_ENCRYPTION_KEY nao pode ser trocada depois sem
# perder o acesso aos favoritos e ao historico ja sincronizados.

SERVICE_PASSWORD_POSTGRES=$(random 32 40)
SERVICE_BASE64_64_ENCRYPTION=$(random 48 64)

# Preencha com o seu e-mail para virar admin ao se cadastrar.
ADMIN_EMAILS=

# Porta publicada no host (a 3000 costuma ja estar ocupada).
APP_PORT=3335

# Marca e precos exibidos (embutidos no build).
NEXT_PUBLIC_APP_NAME=Multitela
NEXT_PUBLIC_TRIAL_DAYS=7
NEXT_PUBLIC_PRICE_MONTHLY=19.90
NEXT_PUBLIC_PRICE_YEARLY=199

# Pagamento online (opcional).
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_MONTHLY=
STRIPE_PRICE_YEARLY=
EOF

chmod 600 "$ENV_FILE"
echo "$ENV_FILE criado com segredos aleatorios."
echo "Coloque seu e-mail em ADMIN_EMAILS e rode: docker compose up -d"
