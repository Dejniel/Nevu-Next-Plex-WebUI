#!/bin/sh
set -eu

npm run db:push
exec node dist/index.js
