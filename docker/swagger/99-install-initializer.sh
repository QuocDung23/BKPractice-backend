#!/bin/sh
set -eu

# The image writes its stock initializer and pre-compresses it to
# swagger-initializer.js.gz, which nginx serves to browsers (gzip_static).
# Install ours afterward and rebuild the .gz so both variants match.
target=/usr/share/nginx/html/swagger-initializer.js
cp /opt/bkpractice/swagger-initializer.js "$target"
gzip < "$target" > "$target.gz"
