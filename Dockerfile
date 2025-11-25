FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates dumb-init && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    && chmod +x /usr/local/bin/cloudflared

RUN set -eux; \
    url=$(curl -s https://api.github.com/repos/SagerNet/sing-box/releases/latest | grep browser_download_url | grep linux-amd64.tar.gz | cut -d '"' -f 4 | head -n1); \
    curl -fsSL -o /tmp/sb.tgz "$url"; \
    mkdir -p /tmp/sb; \
    tar -xzf /tmp/sb.tgz -C /tmp/sb; \
    mv /tmp/sb/sing-box*/sing-box /usr/local/bin/sing-box; \
    chmod +x /usr/local/bin/sing-box; \
    rm -rf /tmp/sb /tmp/sb.tgz

WORKDIR /app

COPY index.js ./

ENV argodomain="" \
    argoauth="" \
    uuid=""

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD pgrep sing-box >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "node", "index.js"]
