# ──────────────────────────────────────────────────────────────────────────────
#  Dockerfile — thehandshake.io
#  Purpose  : Python (FastAPI / uvicorn) + Node.js (agent scripts) hybrid image
#  Builder  : DOCKER (bypass Nixpacks which ignores railway.json)
# ──────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim

# ── Node.js (v20 LTS) ─────────────────────────────────────────────────────────
ENV NODE_VERSION=20

RUN apt-get update -qq && \
    apt-get install -y -qq curl gnupg ca-certificates && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_VERSION}.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list && \
    apt-get update -qq && \
    apt-get install -y -qq nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Working directory ────────────────────────────────────────────────────────
WORKDIR /app

# ── Python dependencies (layer cached) ──────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Node.js dependencies (layer cached) ─────────────────────────────────────
COPY package.json package-lock.json* ./
RUN npm ci

# ── Application code ─────────────────────────────────────────────────────────
COPY . .

# ── Runtime ──────────────────────────────────────────────────────────────────
EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
