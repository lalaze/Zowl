#!/bin/sh
set -eu

node -e '
  const value = process.env.PUBLIC_BASE_URL;
  if (!value) throw new Error("PUBLIC_BASE_URL is required in production");
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("PUBLIC_BASE_URL must use HTTPS");
  }
'

npm run db:migrate

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec npm run start -- --hostname 0.0.0.0 --port 3000
