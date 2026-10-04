#!/bin/sh
# Папку данных Docker часто создаёт от root. Отдаём её пользователю node и запускаем сервер от него.
set -e
mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR"
exec su-exec node "$@"
