# ── build: install deps from pyproject.toml ───────────────────────────────────
FROM python:3.12-slim AS build
WORKDIR /app
COPY apps/ai-service/pyproject.toml ./
RUN python -c "\
import tomllib, subprocess, sys; \
data = tomllib.load(open('pyproject.toml','rb')); \
deps = data['project']['dependencies']; \
subprocess.run([sys.executable,'-m','pip','install','--no-cache-dir','--prefix=/install']+deps, check=True)"

# ── runtime: lean production image ───────────────────────────────────────────
FROM python:3.12-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN useradd -m slotq
COPY --from=build /install /usr/local
COPY apps/ai-service/app ./app
USER slotq
EXPOSE 8000
ENTRYPOINT ["tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
