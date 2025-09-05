# ---- Base
FROM node:20-slim

WORKDIR /app

# Prisma ต้องมี openssl (no-recommends เพื่อลดขนาด)
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# ---- Install deps (รวม devDependencies เพื่อให้มี tsc/tsx)
# *** สำคัญ: อย่าตั้ง NODE_ENV=production ก่อนขั้นตอนนี้ ***
COPY package.json ./
COPY package-lock.json* ./
RUN npm ci || npm install

# ---- Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# ---- Static assets & source
COPY fonts ./fonts
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY README.md ./

# ---- Build
RUN npm run build

# ---- Run
# ตั้ง production หลังจาก build เสร็จ เพื่อไม่ให้ตัด devDeps ตอนติดตั้ง
ENV NODE_ENV=production

# migrate + seed แล้วเลือก process ตาม SERVICE_ROLE
# seed ต้องชี้ไปที่ไฟล์ที่ build แล้ว (dist/scripts/seed.js)
CMD ["bash","-lc", "\
    npx prisma migrate deploy && \
    npx prisma db seed || true; \
    if [ \"$SERVICE_ROLE\" = \"worker\" ]; then \
    node dist/scheduler/worker.js; \
    else \
    node dist/main.js; \
    fi \
    "]