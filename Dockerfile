FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN npm run prisma:gen && npm run build
CMD ["bash","-lc","if [ \"$SERVICE_ROLE\" = \"worker\" ]; then npm run start:worker; else npm run start:bot; fi"]