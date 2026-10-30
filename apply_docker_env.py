path = r"docker-compose.yml"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace postgres block
old_postgres = """    environment:
      POSTGRES_USER: zytasafe
      POSTGRES_PASSWORD: zytasafe_secure_pass
      POSTGRES_DB: zytasafe_db
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - control-plane-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U zytasafe -d zytasafe_db"]"""

new_postgres = """    environment:
      POSTGRES_USER: ${POSTGRES_USER:-zytasafe}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-zytasafe_secure_pass}
      POSTGRES_DB: ${POSTGRES_DB:-zytasafe_db}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - control-plane-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER:-zytasafe} -d $${POSTGRES_DB:-zytasafe_db}"]"""

content = content.replace(old_postgres, new_postgres)

# Replace livekit block
old_lk = """    command: ["--dev", "--bind", "0.0.0.0", "--keys", "devkey: secret"]"""
new_lk = """    command: ["--dev", "--bind", "0.0.0.0", "--keys", "${LIVEKIT_API_KEY:-devkey}: ${LIVEKIT_API_SECRET:-secret}"]"""
content = content.replace(old_lk, new_lk)

# Replace backend db url
old_be = """      - DATABASE_URL=postgresql://zytasafe:zytasafe_secure_pass@postgres:5432/zytasafe_db
      - PAYMENT_SERVICE_URL=http://payment-service:8001
      - LIVEKIT_URL=http://livekit:7880
      - LIVEKIT_API_KEY=devkey
      - LIVEKIT_API_SECRET=secret"""

new_be = """      - DATABASE_URL=postgresql://${POSTGRES_USER:-zytasafe}:${POSTGRES_PASSWORD:-zytasafe_secure_pass}@postgres:5432/${POSTGRES_DB:-zytasafe_db}
      - PAYMENT_SERVICE_URL=http://payment-service:8001
      - LIVEKIT_URL=${LIVEKIT_URL:-http://livekit:7880}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY:-devkey}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET:-secret}
      - COPILOT_PROVIDER=${COPILOT_PROVIDER:-local}"""

content = content.replace(old_be, new_be)

# Replace payment livekit
old_pay = """      - LIVEKIT_URL=http://livekit:7880
      - LIVEKIT_API_KEY=devkey
      - LIVEKIT_API_SECRET=secret"""

new_pay = """      - LIVEKIT_URL=${LIVEKIT_URL:-http://livekit:7880}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY:-devkey}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET:-secret}"""

content = content.replace(old_pay, new_pay)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("SUCCESS_DOCKER_COMPOSE_ENV")

