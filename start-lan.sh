#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Запуск Kanban Board в фоне (log: server.log)..."
nohup node server.js > server.log 2>&1 &
echo "PID: $!"