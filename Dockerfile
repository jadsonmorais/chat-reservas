# ── Build stage ──────────────────────────────────────────────
FROM python:3.12-alpine AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Production stage ─────────────────────────────────────────
FROM python:3.12-alpine AS production

WORKDIR /app

COPY --from=builder /install /usr/local

COPY app/ ./app/
COPY public/ ./public/
COPY config.py run.py ./

# Non-root user (UID 1001 matches the original Node image)
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser
USER appuser

EXPOSE 3000

# --timeout 120: BEST_WINDOW fires 14 concurrent searches (can take 60-90s total)
CMD ["gunicorn", "--bind", "0.0.0.0:3000", "--workers", "2", "--threads", "8", "--timeout", "120", "run:app"]
