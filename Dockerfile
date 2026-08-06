# 1. Utiliser une base Linux avec Python
FROM python:3.10-slim

# Éviter les invites interactives pendant l'installation
ENV DEBIAN_FRONTEND=noninteractive

# 2. Installer LibreOffice, Calibre, Xvfb et les outils système
RUN apt-get update && apt-get install -y \
    libreoffice \
    calibre \
    xvfb \
    fonts-liberation \
    fontconfig \
    cabextract \
    wget \
    && rm -rf /var/lib/apt/lists/*

# 3. Télécharger et installer automatiquement les polices Microsoft
RUN wget https://www.freedesktop.org/software/fontconfig/webfonts/webfonts.tar.gz && \
    tar -xzf webfonts.tar.gz && \
    cd msfonts && \
    cabextract *.exe && \
    mkdir -p /usr/share/fonts/truetype/msttcorefonts && \
    cp *.ttf *.TTF /usr/share/fonts/truetype/msttcorefonts/ 2>/dev/null || true && \
    fc-cache -f -v && \
    cd .. && rm -rf msfonts webfonts.tar.gz

# 4. Dossier de travail
WORKDIR /app

# 5. Copier et installer les dépendances Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copier tout le code dans le serveur
COPY . .

# 7. Lancer l'API FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
