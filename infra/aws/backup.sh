#!/bin/bash
set -euo pipefail
umask 077
cd /srv/afterlife
install -d -m 700 backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="backups/worlds-$stamp.sql.gz"
container=$(docker compose ps -q postgres)
docker exec "$container" pg_dump -U afterlife -d afterlife --no-owner --no-privileges | gzip > "$file"
bucket=$(python3 -c 'import json; print(json.load(open("deploy-meta.json"))["bucket"])')
region=$(python3 -c 'import json; print(json.load(open("deploy-meta.json"))["region"])')
aws s3 cp "$file" "s3://$bucket/backups/worlds-$stamp.sql.gz" --region "$region" --sse AES256 --only-show-errors
rm "$file"
