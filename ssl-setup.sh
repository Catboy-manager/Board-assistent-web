#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

command -v openssl >/dev/null || { echo "openssl not found"; exit 1; }
mkdir -p ssl

HOSTNAME=$(hostname)
IP_LIST=$(ip -o -4 addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]}' | grep -Ev '^(127\.|$) ' | sort -u)

[ -z "$IP_LIST" ] && IP_LIST="127.0.0.1"

if [ ! -f ssl/ca.key ] || [ ! -f ssl/ca.pem ]; then
  echo "== Generating local CA =="
  openssl genrsa -out ssl/ca.key 4096 2>/dev/null
  openssl req -x509 -new -nodes -key ssl/ca.key -sha256 -days 3650 \
    -out ssl/ca.pem -subj "/CN=KanbanBoard Local CA/O=KanbanBoard"
fi

SAN="DNS:localhost,DNS:$HOSTNAME,DNS:$HOSTNAME.local,IP:127.0.0.1"
for ip in $IP_LIST; do SAN="$SAN,IP:$ip"; done

CUR=$(cat ssl/sans.txt 2>/dev/null || echo "")
needs_gen=0
[ -f ssl/server.pem ] && [ -f ssl/server.key ] || needs_gen=1
[ "$CUR" != "$SAN" ] && needs_gen=1

if [ "$needs_gen" = "1" ]; then
  echo "== Generating server certificate =="
  openssl genrsa -out ssl/server.key 2048 2>/dev/null
  openssl req -new -key ssl/server.key -out ssl/server.csr -subj "/CN=$HOSTNAME.local"
  openssl x509 -req -in ssl/server.csr -CA ssl/ca.pem -CAkey ssl/ca.key -CAcreateserial \
    -out ssl/server.pem -days 825 -sha256 \
    -extfile <(printf "subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=keyEncipherment,digitalSignature\nextendedKeyUsage=serverAuth,clientAuth\n" "$SAN")
  echo "$SAN" > ssl/sans.txt
fi

if [ ! -f /usr/local/share/ca-certificates/kanban-board-local-ca.crt ]; then
  echo "== Installing CA into system trust store (needs root) =="
  sudo -p "root password: " cp ssl/ca.pem /usr/local/share/ca-certificates/kanban-board-local-ca.crt
  sudo update-ca-certificates
fi

if command -v certutil >/dev/null 2>&1; then
  certutil -d "sql:$HOME/.pki/nssdb" -A -t "C,," -n "KanbanBoard Local CA" -i ssl/ca.pem 2>/dev/null || \
  certutil -d "sql:$HOME/.pki/nssdb" -D -n "KanbanBoard Local CA" \
  && certutil -d "sql:$HOME/.pki/nssdb" -A -t "C,," -n "KanbanBoard Local CA" -i ssl/ca.pem
fi

echo "== Done =="
echo "Cert SANs: $SAN"
echo "Files: ssl/server.pem, ssl/server.key, ssl/ca.pem"