#!/usr/bin/env bash
cd "$(dirname "$0")/.."

echo "=== Kiem tra du lieu Mods & Libraries ==="
if [ ! -d "./mods" ] || [ ! -d "./libraries" ] || [ $(find ./mods -maxdepth 1 -name "*.jar" 2>/dev/null | wc -l) -lt 200 ]; then
    echo "Chua co du bo mods tren Cloud! Dang tai tu dong tu Google Drive cua ban (1eKZVfJSo0c49VhZMonpZE5kURegY0V16)..."
    python3 -m pip install -q gdown
    gdown --id 1eKZVfJSo0c49VhZMonpZE5kURegY0V16 -O /tmp/NeoForge-ModSlime.zip
    echo "Dang giai nen mods & libraries..."
    unzip -q -n /tmp/NeoForge-ModSlime.zip "NeoForge-ModSlime/mods/*" "NeoForge-ModSlime/libraries/*" -d /tmp/extract_modslime
    cp -rn /tmp/extract_modslime/NeoForge-ModSlime/mods ./
    cp -rn /tmp/extract_modslime/NeoForge-ModSlime/libraries ./
    rm -rf /tmp/NeoForge-ModSlime.zip /tmp/extract_modslime
    echo "Da tai xong toan bo Mods & Libraries tu Google Drive!"
fi

# Download playit-linux-amd64 if on Linux and not present
if [ "$(uname -s)" = "Linux" ] && [ ! -f "./playit-linux-amd64" ]; then
    curl -sSL https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-amd64 -o ./playit-linux-amd64
    chmod +x ./playit-linux-amd64
fi

python3 web-panel/app.py
