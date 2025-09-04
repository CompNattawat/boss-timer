FROM node:20-slim

WORKDIR /app

# Prisma ต้องใช้ OpenSSL
RUN apt-get update -y && apt-get install -y openssl

# ติดตั้ง deps (ถ้ามี package-lock.json แนะนำใช้ npm ci)
COPY package.json ./
# COPY package-lock.json ./   # มีค่อย uncomment
RUN npm install

# สร้าง Prisma Client ก่อน (ต้อง copy โฟลเดอร์ prisma มาก่อน)
COPY prisma ./prisma
RUN npx prisma generate

# ค่อย copy โค้ดที่เหลือ แล้ว build
COPY . .
RUN npm run build

# รัน migrate + seed เสมอ แล้วค่อยเลือก start ตาม SERVICE_ROLE
CMD ["bash","-lc","npx prisma migrate deploy && npx prisma db seed || true; if [ \"$SERVICE_ROLE\" = \"worker\" ]; then npm run start:worker; else npm run start:bot; fi"]