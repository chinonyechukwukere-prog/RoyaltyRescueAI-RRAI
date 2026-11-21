# =============================================================================
# Royalty Rescue AI (RRAI) — Dockerfile
# IBM Cloud Code Engine deployment — OA-1
# Architecture v1.7 §11
#
# Multi-stage build using Next.js standalone output.
# Secrets are injected at runtime via Code Engine environment variables —
# NEVER baked into the image at build time.
#
# Build args (provided by Code Engine build config, not stored in image):
#   None required — all secrets are runtime env vars only.
# =============================================================================

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
# Use --frozen-lockfile instead of npm ci — tolerant of lockfile metadata
# differences between npm versions while still preventing new dependency
# resolution (same security guarantee for a known-good lock file).
RUN npm install --omit=dev --frozen-lockfile

# ── Stage 2: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time public env vars (non-secret — Supabase URL and anon key are
# safe for the browser bundle; they enforce Row-Level Security server-side).
# These are passed as build args so they can be overridden per environment.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG DEFAULT_CITIZEN_ORG_ID=aaaaaaaa-0001-0001-0001-000000000001
ARG WEBHOOK_ORG_B_ID=bbbbbbbb-0002-0002-0002-000000000002

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV DEFAULT_CITIZEN_ORG_ID=$DEFAULT_CITIZEN_ORG_ID
ENV WEBHOOK_ORG_B_ID=$WEBHOOK_ORG_B_ID

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user (Code Engine best practice)
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy only the standalone output — node_modules are bundled inside it
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Runtime secrets are injected by Code Engine as environment variables:
#   SUPABASE_SERVICE_ROLE_KEY
#   WATSONX_API_KEY
#   WATSONX_PROJECT_ID
#   WATSONX_URL
#   WEBHOOK_112_SECRET
#   OUTDATED_THRESHOLD_HOURS
# Never set those above — they must come from Code Engine secret/configmap only.

CMD ["node", "server.js"]
