#!/bin/bash
# ダブルクリックで起動（初回のみ: 右クリック → 開く、または chmod +x 実行権限を付与）
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
exec node cli.js serve --open --port 3847
