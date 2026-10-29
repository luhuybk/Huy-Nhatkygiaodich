#!/usr/bin/env bash
# Tạo khoá cho trang chuyển tiếp cảnh báo (supabase/functions/alert-relay), cất lên Supabase rồi deploy.
# Khoá chỉ nằm ở .alert-relay-key trên máy này (gitignore) và trong biến ALERT_RELAY_KEY của Supabase.
# Chạy lại lúc nào cũng được: khoá cũ được giữ nguyên, địa chỉ đã dán ở TradingView/VPS vẫn dùng tiếp.
#   bash scripts/alert-relay-key.sh          tạo (nếu chưa có) + deploy + gửi tin thử
#   bash scripts/alert-relay-key.sh --new    đổi khoá mới (địa chỉ cũ hết dùng được)
set -euo pipefail
cd "$(dirname "$0")/.."

KEY_FILE=.alert-relay-key
if [ "${1:-}" = "--new" ] || [ ! -s "$KEY_FILE" ]; then
  openssl rand -hex 20 > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
fi
KEY=$(tr -d '[:space:]' < "$KEY_FILE")
REF=$(tr -d '[:space:]' < supabase/.temp/project-ref)
URL="https://$REF.supabase.co/functions/v1/alert-relay?key=$KEY"

supabase secrets set ALERT_RELAY_KEY="$KEY"
supabase functions deploy alert-relay --no-verify-jwt

echo
echo "Gửi tin thử sang Telegram…"
curl -sS -X POST "$URL&from=tv" -H 'Content-Type: text/plain' --data-binary 'Kênh cảnh báo đã thông ✅'
echo
echo
echo "Địa chỉ cho EA (dán vào KeoSL_telegram.txt trên VPS):"
echo "$URL"
echo
echo "Webhook URL cho TradingView (thêm &topic=<ID topic> nếu muốn vào topic riêng):"
echo "$URL&from=tv"
