/**
 * Kite ticker binary frame parser. Faithful port of `_qwParsePacket` / `_qwParseBinaryMessage` in static/autoTrade/quoteWs.js
 * (same offsets, same divisors, same field meanings) so ticks mean the same thing as in the userscript.
 */
export interface DepthLevel {
  qty: number;
  price: number;
  orders: number;
}

export interface Tick {
  token: number;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  tradable: boolean;
  /** exchange timestamp, unix seconds (0 when the packet does not carry one) */
  ts?: number;
  volume?: number;
  totalBuyQty?: number;
  totalSellQty?: number;
  depth?: { buy: DepthLevel[]; sell: DepthLevel[] } | null;
  /** day VWAP (average traded price) */
  avgPrice?: number;
  oi?: number | null;
  oiHigh?: number | null;
  oiLow?: number | null;
}

/** Price divisor by exchange segment (last byte of the token): currency segments use 1e7, everything else 100. */
export function divisorForToken(token: number): number {
  const seg = token & 0xff;
  return seg === 3 || seg === 6 ? 10000000 : 100;
}

export function parsePacket(view: DataView, offset: number, size: number): Tick | null {
  if (size < 8) return null;
  const token = view.getUint32(offset, false);
  const div = divisorForToken(token);
  const ltp = view.getUint32(offset + 4, false) / div;
  const tradable = (token & 0xff) !== 9;

  if (size === 8) return { token, ltp, open: 0, high: 0, low: 0, close: 0, change: 0, tradable };

  let exTs = 0;
  if (size === 32) exTs = view.getUint32(offset + 28, false);
  else if (size >= 64) exTs = view.getUint32(offset + 60, false);

  if (size === 28 || size === 32) {
    const high = view.getUint32(offset + 8, false) / div;
    const low = view.getUint32(offset + 12, false) / div;
    const open = view.getUint32(offset + 16, false) / div;
    const close = view.getUint32(offset + 20, false) / div;
    const change = view.getInt32(offset + 24, false) / div;
    return { token, ltp, open, high, low, close, change, tradable: false, ts: exTs };
  }

  if (size >= 44) {
    const open = view.getUint32(offset + 28, false) / div;
    const high = view.getUint32(offset + 32, false) / div;
    const low = view.getUint32(offset + 36, false) / div;
    const close = view.getUint32(offset + 40, false) / div;
    const volume = view.getUint32(offset + 16, false);
    const totalBuyQty = view.getUint32(offset + 20, false);
    const totalSellQty = view.getUint32(offset + 24, false);
    const avgPrice = view.getUint32(offset + 12, false) / div;
    let oi: number | null = null;
    let oiHigh: number | null = null;
    let oiLow: number | null = null;
    if (size >= 64) {
      oi = view.getUint32(offset + 48, false);
      oiHigh = view.getUint32(offset + 52, false);
      oiLow = view.getUint32(offset + 56, false);
    }
    let depth: Tick['depth'] = null;
    if (size >= 184) {
      depth = { buy: [], sell: [] };
      for (let lvl = 0; lvl < 5; lvl++) {
        const bid = offset + 64 + lvl * 12;
        depth.buy.push({ qty: view.getInt32(bid, false), price: view.getInt32(bid + 4, false) / div, orders: view.getInt16(bid + 8, false) });
        const ask = offset + 64 + 60 + lvl * 12;
        depth.sell.push({ qty: view.getInt32(ask, false), price: view.getInt32(ask + 4, false) / div, orders: view.getInt16(ask + 8, false) });
      }
    }
    return { token, ltp, open, high, low, close, change: ltp - close, volume, tradable: true, totalBuyQty, totalSellQty, depth, avgPrice, oi, oiHigh, oiLow, ts: exTs };
  }
  return null;
}

/** A binary frame: 2-byte packet count, then [2-byte size][packet]... A 1-byte frame is the heartbeat and yields no ticks. */
export function parseFrame(data: ArrayBuffer | Uint8Array): Tick[] {
  const buf = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  const view = new DataView(buf as ArrayBuffer);
  if (view.byteLength < 2) return [];
  const n = view.getUint16(0, false);
  const out: Tick[] = [];
  let offset = 2;
  for (let i = 0; i < n; i++) {
    if (offset + 2 > view.byteLength) break;
    const size = view.getUint16(offset, false);
    offset += 2;
    if (offset + size > view.byteLength) break;
    const t = parsePacket(view, offset, size);
    if (t) out.push(t);
    offset += size;
  }
  return out;
}
