FROM mcr.microsoft.com/playwright/python:v1.58.0-jammy

RUN apt-get update && apt-get install -y --no-install-recommends \
    dbus \
    dbus-daemon \
    libdbus-1-3 \
    ca-certificates \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    HEADLESS=true \
    STATE_PATH=/app/storage/linkedin_state.json \
    PLAYWRIGHT_CHROMIUM_LAUNCH_ARGS="--disable-dev-shm-usage --no-sandbox --disable-setuid-sandbox --disable-infobars --disable-crash-reporter" \
    PLAYWRIGHT_DOWNLOAD_HOST=https://github.com

WORKDIR /app

COPY requirements.txt ./

# Cài setuptools trước để đảm bảo pkg_resources có sẵn cho playwright-stealth==1.0.6
# (setuptools>=70 đã drop pkg_resources — phải pin <70)
RUN pip install --upgrade pip \
    && pip install "setuptools<70" wheel \
    && pip install -r requirements.txt \
    && pip install "setuptools<70"

COPY . .

RUN mkdir -p /app/storage/session /app/storage/runtime /app/data/raw /app/data/output \
    && chown -R pwuser:pwuser /app

USER pwuser

EXPOSE 8000

VOLUME ["/app/storage", "/app/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health').read()"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
