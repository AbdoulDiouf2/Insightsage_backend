# InsightSage Agent - Docker Image
# Pour déploiement sur serveurs containerisés

FROM python:3.11-slim-bookworm

# Metadata
LABEL maintainer="InsightSage Team"
LABEL description="InsightSage Agent - Secure On-Premise Sage Connector"
LABEL version="1.0.0"

# Variables d'environnement
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Installer les dépendances système (ODBC Driver pour SQL Server)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg2 \
    unixodbc \
    unixodbc-dev \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && curl -fsSL https://packages.microsoft.com/config/debian/12/prod.list > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql17 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Créer utilisateur non-root
RUN useradd -r -s /bin/false -d /app insightsage

# Créer les répertoires
WORKDIR /app
RUN mkdir -p /app/logs /app/config && chown -R insightsage:insightsage /app

# Copier les requirements et installer les dépendances
COPY --chown=insightsage:insightsage requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier le code source
COPY --chown=insightsage:insightsage src/ ./src/
COPY --chown=insightsage:insightsage config/config.example.yaml ./config/

# Passer à l'utilisateur non-root
USER insightsage

# Port exposé
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Commande de démarrage
CMD ["python", "-m", "src.main", "-c", "/app/config/config.yaml"]
