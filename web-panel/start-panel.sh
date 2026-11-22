#!/usr/bin/env bash
cd "$(dirname "$0")/.."

# Download playit-linux-amd64 in background if on Linux and not present
if [ "$(uname -s)" = "Linux" ] && [ ! -f "./playit-linux-amd64" ]; then
    (curl -sSL https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-amd64 -o ./playit-linux-amd64 && chmod +x ./playit-linux-amd64) &
fi

# Start Web Panel immediately on port 8080 (app.py will stream Google Drive mod download progress directly to the web console!)
exec python3 web-panel/app.py
