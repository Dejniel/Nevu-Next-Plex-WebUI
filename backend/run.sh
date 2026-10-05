#!/bin/sh
set -eu

if [ "${TLS_SELF_SIGNED:-false}" = "true" ]; then
    TLS_CERT_PATH=${TLS_CERT_PATH:-/app/data/tls/cert.pem}
    TLS_KEY_PATH=${TLS_KEY_PATH:-/app/data/tls/key.pem}
    tls_common_name=${TLS_COMMON_NAME:-localhost}
    tls_subject_alt_name=${TLS_SUBJECT_ALT_NAME:-DNS:$tls_common_name}

    if [ ! -s "$TLS_CERT_PATH" ] || [ ! -s "$TLS_KEY_PATH" ] || \
        ! openssl x509 -checkend 2592000 -noout -in "$TLS_CERT_PATH" >/dev/null 2>&1; then
        mkdir -p "$(dirname "$TLS_CERT_PATH")" "$(dirname "$TLS_KEY_PATH")"
        umask 077
        openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 825 \
            -keyout "$TLS_KEY_PATH.tmp" \
            -out "$TLS_CERT_PATH.tmp" \
            -subj "/CN=$tls_common_name" \
            -addext "subjectAltName=$tls_subject_alt_name"
        mv "$TLS_KEY_PATH.tmp" "$TLS_KEY_PATH"
        mv "$TLS_CERT_PATH.tmp" "$TLS_CERT_PATH"
        echo "Generated self-signed TLS certificate for $tls_subject_alt_name"
    fi

    export TLS_CERT_PATH TLS_KEY_PATH
fi

exec node dist/index.js
