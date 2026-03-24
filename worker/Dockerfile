FROM python:3.12-slim AS base

WORKDIR /app

# Install system dependencies + Node.js (for ESLint)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    unzip \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install Semgrep
RUN pip install semgrep --no-cache-dir

# Install ESLint + TypeScript support globally
RUN npm install -g \
    eslint@8 \
    @typescript-eslint/parser@7 \
    @typescript-eslint/eslint-plugin@7 \
    eslint-plugin-security@3 \
    typescript@5 \
    && npm cache clean --force

# Install Pylint
RUN pip install pylint --no-cache-dir

# Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt --no-cache-dir

COPY . .

# Create non-root user
RUN useradd -m -u 1001 worker && chown -R worker:worker /app
USER worker

CMD ["python", "-u", "worker.py"]
