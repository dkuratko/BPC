#!/usr/bin/env bash
# One-command setup for the Build Play estimating system.
#   bash scripts/setup.sh
set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

say "1/5  Checking prerequisites"
command -v node >/dev/null || { echo "Node.js 20 or newer is required: https://nodejs.org"; exit 1; }
node_major=$(node -p "process.versions.node.split('.')[0]")
if [ "$node_major" -lt 20 ]; then
  echo "Node.js 20 or newer is required (found $(node -v))."
  exit 1
fi
echo "Node $(node -v)"

if ! docker info >/dev/null 2>&1; then
  echo
  echo "Docker is not running. Either start Docker Desktop and run this again, or"
  echo "point MONGODB_URI in .env.local at a MongoDB you already have."
  DOCKER_OK=0
else
  DOCKER_OK=1
  echo "Docker is running"
fi

say "2/5  Writing .env.local"
if [ -f .env.local ]; then
  echo ".env.local already exists, leaving it alone"
else
  cp .env.example .env.local
  # A weak session secret is a real problem, so generate a strong one rather
  # than shipping a default nobody changes.
  if command -v openssl >/dev/null; then
    secret=$(openssl rand -base64 32)
  else
    secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  fi
  node -e "
    const fs = require('fs');
    const text = fs.readFileSync('.env.local', 'utf8')
      .replace(/^AUTH_SECRET=.*\$/m, 'AUTH_SECRET=' + process.argv[1]);
    fs.writeFileSync('.env.local', text);
  " "$secret"
  echo "Created .env.local with a fresh session secret"
fi

say "3/5  Installing dependencies"
npm install --no-audit --no-fund

if [ "$DOCKER_OK" = "1" ]; then
  say "4/5  Starting MongoDB"
  docker compose up -d
  printf "Waiting for MongoDB"
  for _ in $(seq 1 30); do
    if docker compose exec -T mongo mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
      printf " ready\n"; break
    fi
    printf "."; sleep 1
  done
else
  say "4/5  Skipping MongoDB (Docker is not running)"
fi

say "5/5  Seeding starting data"
npm run seed

cat <<'MSG'

Done. Start the app with:

    npm run dev

then open http://localhost:3000 and sign in as:

    admin@buildplay.local  /  changeme-please-1

Change that password under Settings before anyone else uses it.

Everything the seed put in is a PLACEHOLDER — wages, rental prices, material
prices, overhead, and the site-factor percentages. Replace them with real Build
Play numbers before an estimate goes to a customer.
MSG
