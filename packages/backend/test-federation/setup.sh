#!/bin/bash
set -euo pipefail
mkdir -p certificates results

openssl genrsa -des3 -passout pass:rootCA -out certificates/rootCA.key 4096
openssl req -x509 -new -nodes -batch -key certificates/rootCA.key -sha256 \
  -days 1024 -passin pass:rootCA -subj "/CN=Misskey federation test CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -out certificates/rootCA.crt

function generate {
  openssl req -new -newkey rsa:2048 -sha256 -nodes \
    -keyout certificates/$1.key \
    -subj "/CN=$1/emailAddress=admin@$1/C=JP/ST=/L=/O=Misskey Tester/OU=Some Unit" \
    -out certificates/$1.csr
  openssl x509 -req -sha256 \
    -in certificates/$1.csr \
    -CA certificates/rootCA.crt \
    -CAkey certificates/rootCA.key \
    -CAcreateserial \
    -passin pass:rootCA \
    -out certificates/$1.crt \
    -days 500 \
    -extfile <(printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:%s\n' "$1")
  # nginx の変数付き証明書パスは非 root worker が読む。テスト専用の leaf key に限る。
  chmod 644 "certificates/$1.key"
  if [ ! -f .config/docker.env ]; then cp .config/example.docker.env .config/docker.env; fi
  if [ ! -f .config/$1.conf ]; then sed "s/\${HOST}/$1/g" .config/example.conf > .config/$1.conf; fi
  sed "s/\${HOST}/$1/g" .config/example.config.json > .config/$1.config.json
  sed "s/\${HOST}/$1/g" matrix.nginx.conf.tpl > .config/$1.matrix.conf
}

generate a.test
generate b.test
