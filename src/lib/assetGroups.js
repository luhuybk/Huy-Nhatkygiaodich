import { useCallback, useMemo, useState } from "react";
import { canonicalSymbol, tradeCurrency } from "./helpers.js";

// Nhóm tài sản tự nhận theo mã — hàng hóa đánh chung tài khoản với FX (cùng khung để EA kéo SL)
// mà cuối tuần vẫn phải tách được hiệu suất riêng, nên không thể lọc theo tài khoản.
export const ASSET_GROUPS = [
  { key: "fx", label: "Forex" },
  { key: "commodity", label: "Hàng hóa" },
  { key: "index", label: "Chỉ số" },
  { key: "crypto", label: "Crypto" },
  { key: "us", label: "CP Mỹ" },
  { key: "vn", label: "CP Việt Nam" },
  { key: "other", label: "Khác" },
];

// Không có XAU/XAG: "XAUUSD" là vàng, phải rơi vào Hàng hóa chứ không thành một cặp tiền.
const FX_CCY = new Set([
  "AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD", "SGD", "HKD", "CNH", "MXN", "ZAR", "TRY",
  "SEK", "NOK", "DKK", "PLN", "HUF", "CZK", "THB", "INR", "ILS", "KRW", "TWD", "BRL", "AED", "SAR",
]);
// Mã Exness (XAUUSD, XNGUSD, USOIL…), tên gọi thường và mã hợp đồng tương lai (GC, CL… kèm tháng).
const COMMODITY = /^(XAU|XAG|XPT|XPD|XCU|XAL|XNI|XPB|XZN|XNG|XBR|XTI|USOIL|UKOIL|WTI|BRENT|NGAS|NATGAS|GOLD|SILVER|COPPER|PLATINUM|PALLADIUM|COCOA|COFFEE|SUGAR|CORN|WHEAT|SOYBEAN|COTTON)/;
const COMMODITY_FUT = /^(GC|SI|HG|CL|NG|PL|PA|ZC|ZW|ZS|KC|CC|SB|CT|MGC|MCL)([FGHJKMNQUVXZ]\d{1,2})?$/;
const INDEX = /^(US30|US100|US500|US2000|USTEC|NAS100|NDX|SPX|SP500|SPX500|DJ30|DJI|UK100|FTSE|DE30|DE40|GER30|GER40|DAX|FR40|CAC40|EU50|STOXX50|ESTX50|JP225|JPN225|NIKKEI|HK50|HSI|AUS200|ASX200|CN50|CHINA50|IN50|VIX|DXY|USDX)/;
const INDEX_FUT = /^(ES|NQ|YM|RTY|MES|MNQ|MYM)([FGHJKMNQUVXZ]\d{1,2})?$/;
const CRYPTO = /^(BTC|ETH|XRP|LTC|SOL|ADA|DOGE|BNB|DOT|AVAX|LINK|TRX|XLM|BCH|SHIB|TON)(USD|USDT|USDC|EUR|JPY|BTC)?$/;
// Mã cổ phiếu: 1–5 chữ, có thể kèm đuôi sàn ("NVDA.US", "BRK-B").
const STOCK = /^[A-Z]{1,5}([.\-][A-Z]{1,3})?$/;

export function assetGroupOfSymbol(symbol, currency) {
  const s = canonicalSymbol(symbol || "", []);
  if (!s) return "other";
  // Tài khoản VNĐ chỉ có cổ phiếu Việt Nam — xét trước, vì có mã VN trùng chữ hàng hóa ("OIL" của PV Oil).
  if (currency === "VND") return "vn";
  const compact = s.replace(/[^A-Z0-9]/g, "");
  if (COMMODITY.test(compact) || COMMODITY_FUT.test(compact)) return "commodity";
  if (INDEX.test(compact) || INDEX_FUT.test(compact)) return "index";
  if (CRYPTO.test(compact)) return "crypto";
  // Cho phép đuôi tài khoản Exness ("EURUSDm" → "EURUSDM"): cổ phiếu không bao giờ dài 6 chữ trở lên.
  if (compact.length >= 6 && compact.length <= 9 && FX_CCY.has(compact.slice(0, 3)) && FX_CCY.has(compact.slice(3, 6))) return "fx";
  if (STOCK.test(s)) return "us";
  return "other";
}

const cache = new Map();
export function assetGroupOf(t, resources) {
  const currency = tradeCurrency(t, resources);
  const key = `${t.symbol || ""}|${currency}`;
  if (!cache.has(key)) cache.set(key, assetGroupOfSymbol(t.symbol, currency));
  return cache.get(key);
}

// Chỉ hiện những nhóm thật sự có lệnh, kèm số lệnh để thấy ngay nhóm nào đáng xem.
export function assetGroupOptions(trades, resources) {
  const count = {};
  (trades || []).forEach((t) => {
    if (!t) return;
    const g = assetGroupOf(t, resources);
    count[g] = (count[g] || 0) + 1;
  });
  return ASSET_GROUPS.filter((g) => count[g.key]).map((g) => ({ ...g, count: count[g.key] }));
}

export function useAssetFilter(trades, resources) {
  const [asset, setAsset] = useState("");
  const options = useMemo(() => assetGroupOptions(trades, resources), [trades, resources]);
  const match = useCallback((t) => !asset || assetGroupOf(t, resources) === asset, [asset, resources]);
  return { asset, setAsset, options, match };
}
