# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

# ---- Dependencies ----
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time. The defaults in the code are
# fine for a first deploy; pass --build-arg to brand the build.
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_TRIAL_DAYS
ARG NEXT_PUBLIC_PRICE_MONTHLY
ARG NEXT_PUBLIC_PRICE_YEARLY
ARG NEXT_PUBLIC_AI_PICK_COOLDOWN_DAYS
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_TRIAL_DAYS=$NEXT_PUBLIC_TRIAL_DAYS \
    NEXT_PUBLIC_PRICE_MONTHLY=$NEXT_PUBLIC_PRICE_MONTHLY \
    NEXT_PUBLIC_PRICE_YEARLY=$NEXT_PUBLIC_PRICE_YEARLY \
    NEXT_PUBLIC_AI_PICK_COOLDOWN_DAYS=$NEXT_PUBLIC_AI_PICK_COOLDOWN_DAYS
RUN npm run build

# ---- Run ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# Next.js "standalone" output: minimal server.js + only the traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Migrations are read from disk at runtime, so tracing does not pick them up.
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
