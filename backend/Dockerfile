FROM python:3.11-slim

WORKDIR /app

# system deps (psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x /app/docker-entrypoint.sh
RUN useradd --create-home --shell /usr/sbin/nologin offtrack \
 && mkdir -p /app/media \
 && chown -R offtrack:offtrack /app
USER offtrack

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
