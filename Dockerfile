FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests and Prisma schema from platform subfolder
COPY platform/package*.json ./
COPY platform/prisma ./prisma/

# Install dependencies for build
RUN npm ci

# Copy platform source code
COPY platform/ ./

# Generate Prisma Client & compile TypeScript
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests and install production dependencies
COPY platform/package*.json ./
RUN npm ci --only=production

# Copy compiled artifacts and prisma client from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
