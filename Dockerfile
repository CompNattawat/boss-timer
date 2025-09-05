# ---- Base image
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

# Prisma ต้องใช้ OpenSSL (slim ไม่มีมาให้)
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# ---- Install deps first (cache-friendly)
# ถ้ามี package-lock.json ให้คัดลอกมาด้วยจะ cache ได้ดีขึ้น
COPY package.json ./
COPY package-lock.json* ./
# พยายามใช้ npm ci ก่อน ถ้าไม่มี lock ให้ fallback เป็น npm install
RUN npm ci --omit=dev || npm install --omit=dev

# ---- Prisma Client
COPY prisma ./prisma
RUN npx prisma generate

# ---- App source + fonts
# คัดลอกโฟลเดอร์ฟอนต์ขึ้น image (เช่น fonts/Prompt/*.ttf)
COPY fonts ./fonts
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY README.md ./

# ---- Build
RUN npm run build

# ---- Run
# 1) migrate + seed ทุกครั้งที่เริ่มคอนเทนเนอร์ (ล้มแล้วไม่ให้เด้ง)
# 2) เลือก start ตาม SERVICE_ROLE = "worker" เพื่อรัน worker, อื่นๆ รัน bot
CMD ["bash","-lc", "\
    npx prisma migrate deploy && \
    npx prisma db seed || true; \
    if [ \"$SERVICE_ROLE\" = \"worker\" ]; then \
    node dist/scheduler/worker.js; \
    else \
    node dist/main.js; \
    fi \
    "]