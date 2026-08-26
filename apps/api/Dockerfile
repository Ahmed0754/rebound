FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache openssl
RUN npm install -g pnpm@11.21.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/api apps/api

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN pnpm --filter @rebound/api run prisma:generate

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @rebound/api exec prisma migrate deploy && pnpm --filter @rebound/api exec prisma db seed && pnpm --filter @rebound/api exec tsx src/index.ts"]
