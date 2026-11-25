/**
 * The "oracle": the ORIGINAL userscript functions, loaded from their source files into a sandbox and called directly.
 * The ported TypeScript is checked against these, so a difference is a difference between my code and the real old code,
 * not between my code and a saved value of unknown origin.
 *
 * Only plain functions are extracted (by name, with brace matching that skips strings, template text, comments and regex-like text).
 * Browser globals the functions touch are stubbed (jQ.each, moment from the bundled moment.min.js).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const AUTOTRADE = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../static/autoTrade');


/** The original 9:15 strategy table, read from the userscript so the oracle uses the real data. */
const GTB_STRAT_LOOKUP_FOR_TESTS: Record<string, { outcome: string; level: string }> = (() => {
  const src = readFileSync(resolve(AUTOTRADE, 'grootTradeBot.js'), 'utf8');
  const a = src.indexOf('var GTB_STRAT_LOOKUP = {');
  const b = src.indexOf('};', a);
  // eslint-disable-next-line no-new-func
  return new Function('return ' + src.slice(a + 'var GTB_STRAT_LOOKUP = '.length, b + 1))() as Record<string, { outcome: string; level: string }>;
})();


/** The original macro driver table, read from the userscript. */
const MACRO_DRIVERS_FOR_TESTS: unknown = (() => {
  const src = readFileSync(resolve(AUTOTRADE, 'macro.js'), 'utf8');
  const a = src.indexOf('var _MC_DRIVERS = [');
  const b = src.indexOf('];', a);
  // eslint-disable-next-line no-new-func
  return new Function('return ' + src.slice(a + 'var _MC_DRIVERS = '.length, b + 1))();
})();

/** The last non-space character before position i (used to tell a regular expression from a division). */
function prevCode(src: string, i: number): string {
  for (let k = i - 1; k >= 0; k--) if (!/\s/.test(src[k]!)) return src[k]!;
  return '';
}

/** Source text of `function name(...) { ... }` (or `async function`) from a source string. Throws when not found. */
export function extractFunction(src: string, name: string): string {
  const re = new RegExp(`(^|\\n)(async\\s+)?function\\s+${name.replace(/\$/g, '\\$')}\\s*\\(`);
  const m = re.exec(src);
  if (!m) throw new Error(`function ${name} not found`);
  const start = m.index + (m[1] ? m[1].length : 0);
  let i = src.indexOf('(', start);
  // skip the parameter list
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) break;
    }
  }
  i = src.indexOf('{', i);
  let braces = 0;
  let state: 'code' | "'" | '"' | '`' | '//' | '/*' = 'code';
  for (; i < src.length; i++) {
    const ch = src[i]!;
    const nx = src[i + 1];
    if (state === 'code') {
      if (ch === "'" || ch === '"' || ch === '`') state = ch;
      else if (ch === '/' && nx !== '/' && nx !== '*' && /[(,=:[!&|?{};]/.test(prevCode(src, i))) {
        // a regular expression literal: skip to its closing slash (a slash inside [...] does not close it)
        let inClass = false;
        for (i++; i < src.length; i++) {
          const c = src[i]!;
          if (c === '\\') i++;
          else if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) break;
        }
      } else if (ch === '/' && nx === '/') {
        state = '//';
        i++;
      } else if (ch === '/' && nx === '*') {
        state = '/*';
        i++;
      } else if (ch === '{') braces++;
      else if (ch === '}') {
        braces--;
        if (braces === 0) return src.slice(start, i + 1);
      }
    } else if (state === '//') {
      if (ch === '\n') state = 'code';
    } else if (state === '/*') {
      if (ch === '*' && nx === '/') {
        state = 'code';
        i++;
      }
    } else {
      // inside a string or template: skip escaped characters, leave on the matching quote
      if (ch === '\\') i++;
      else if (ch === state) state = 'code';
    }
  }
  throw new Error(`function ${name}: unbalanced braces`);
}

export type OracleFn = (...args: unknown[]) => unknown;

export interface Oracle {
  call(name: string, ...args: unknown[]): unknown;
  has(name: string): boolean;
  ctx: Record<string, unknown>;
}

/** Loads the named functions of the given userscript files into one sandbox. */
export function loadOracle(spec: { file: string; fns: string[]; patch?: Record<string, (src: string) => string> }[], preamble = ''): Oracle {
  const sandbox: Record<string, unknown> = {
    console,
    Math,
    JSON,
    Date,
    parseFloat,
    parseInt,
    isNaN,
    Number,
    String,
    Array,
    Object,
  };
  const ctx = vm.createContext(sandbox);
  // moment from the bundled library (a UMD build that sets a global in a plain script context)
  const momentSrc = readFileSync(resolve(AUTOTRADE, 'common/moment.min.js'), 'utf8');
  vm.runInContext(momentSrc, ctx);
  vm.runInContext(
    `var jQ = { each: function (o, f) { if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { if (f.call(o[i], i, o[i]) === false) break; } } else { for (var k in o) { if (f.call(o[k], k, o[k]) === false) break; } } return o; }, inArray: function (v, a) { return a.indexOf(v); } };`,
    ctx,
  );
  vm.runInContext(preamble, ctx);
  for (const { file, fns, patch } of spec) {
    const src = readFileSync(resolve(AUTOTRADE, file), 'utf8');
    for (const fn of fns) {
      let code = extractFunction(src, fn);
      if (patch && patch[fn]) code = patch[fn]!(code);
      vm.runInContext(code, ctx, { filename: `${file}:${fn}` });
    }
  }
  return {
    ctx: sandbox,
    has: (name) => typeof sandbox[name] === 'function',
    call: (name, ...args) => {
      const f = sandbox[name] as OracleFn | undefined;
      if (!f) throw new Error(`oracle function ${name} not loaded`);
      return f(...args);
    },
  };
}

/** Values built inside the sandbox belong to another realm; this makes them comparable with plain objects. */
export const plain = <T = unknown>(v: unknown): T => JSON.parse(JSON.stringify(v ?? null)) as T;

/** The futures functions of grootTradeBot.js. */
export const futuresOracle = (): Oracle =>
  loadOracle([{ file: 'grootTradeBot.js', fns: ['getFuturesTrendScore', 'computeIntradayVwap', 'computeFuturesSignals', '_gtbRemarkFromSignals', '_gtbClassifyFutures'] }]);

/** OI / OBV scoring, walls, max pain and the IV-skew score from grootTradeBot.js (generateTrend and INSTRUMENT_SCORE_MAP are stubbed). */
export const oiOracle = (): Oracle =>
  loadOracle(
    [
      {
        file: 'grootTradeBot.js',
        fns: [
          '_gtbIsITM',
          'scoreOIStrikeForSignal',
          '_gtbOiPriceChange',
          'computeOIScoreFromData',
          '_gtbFindWalls',
          '_gtbObvVelocityInfo',
          '_gtbWallVelocity',
          '_gtbWallErosion',
          '_gtbComputeMaxPainGEX',
          '_gtbMaxPainScore',
          '_gtbIVSkewScore',
        ],
      },
    ],
    'var INSTRUMENT_SCORE_MAP = {}; var _GTB_OBV_BASELINE_SAMPLES = 8; var __chg = null; function generateTrend(n) { if (__chg === null) throw new Error("no trend"); return { change: __chg }; }',
  );

/** Black-Scholes, IV and OBV from oiAnalyzer.js. */
export const optionsOracle = (): Oracle =>
  loadOracle([{ file: 'oiAnalyzer.js', fns: ['_normCDF', '_bsPrice', 'calcIV', 'calculateIVSeries', 'calculateOBVFiveMinutesInterval'] }], 'var OI_DIVISOR = 100000;');

/** utils.js level and VIX functions plus the instrument score, with localStorage and the app globals stubbed. */
export const scoreOracle = (): Oracle => {
  const o = loadOracle(
    [
      { file: 'utils.js', fns: ['getStrikeDiff', 'getStrikeDetails', 'calculateVixRange', 'getVixRange', 'generateTrend'] },
      { file: 'grootTradeBot.js', fns: ['_gtbIsITM', 'scoreOIStrikeForSignal', '_gtbFindWalls', '_gtbComputeMaxPainGEX', '_gtbMaxPainScore', '_gtbIVSkewScore', 'computeInstrumentScore'] },
    ],
    [
      'var __store = {};',
      'var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; }, setItem: function (k, v) { __store[k] = String(v); } };',
      'var window = {}; var NSE_STRIKE_DIFF = {}; var INSTRUMENT_SCORE_MAP = {}; var _GTB_TREND_FAIL_SEEN = {}; var __mcx = false;',
      'function _gtbNoteMissingStep() {} function _gtbApiFail() {} function _gtbApiOk() {} function _gtbIsMcxFuture() { return __mcx; }',
    ].join(' '),
  );
  return o;
};

/** Dead zone with its sources stubbed (state through __cs, __walls, __trend, __now). */
export const deadZoneOracle = (): Oracle =>
  loadOracle(
    [{ file: 'grootTradeBot.js', fns: ['_gtbDeadZoneRaw', '_gtbDeadZone', '_gtbDeadZoneText'] }],
    [
      'var _GTB_DZ_BUFFER_PCT = 0.05, _GTB_DZ_REARM_CLOSES = 2, _GTB_DZ_WIDE_X = 1.5, _GTB_DZ_LATCH = {};',
      'var __cs = null; var __walls = null; var __trend = null; var __now = 0; var CURRENT_DAY = "D";',
      'var INSTRUMENT_SCORE_MAP = {}; var _realDate = Date; var Date = { parse: _realDate.parse, now: function () { return __now; } };',
      'function computeInstrumentScore() { if (!__cs) throw new Error("none"); return __cs; }',
      'function _gtbFindWalls() { return __walls; } function generateTrend() { if (!__trend) throw new Error("no trend"); return __trend; }',
      'function _gtbHistTime() { return ""; }',
    ].join(' '),
  );

/** The wall verdict with its data sources stubbed (state through __cs, __vix, __ofi, __trendLtp and INSTRUMENT_SCORE_MAP). */
export const verdictOracle = (): Oracle =>
  loadOracle(
    [
      {
        file: 'grootTradeBot.js',
        fns: ['_gtbIsITM', 'scoreOIStrikeForSignal', '_gtbMarketProfile', '_gtbMaxPainOutcome', '_gtbFlowVsPullConflict', '_gtbFuturesOIConflict', '_cmdBuildVerdict'],
      },
    ],
    [
      'var __cs = null; var __vix = 0; var __ofi = null; var __trendLtp = null; var INSTRUMENT_SCORE_MAP = {}; var VOL_EXTREME = {};',
      'function computeInstrumentScore() { if (!__cs) throw new Error("none"); return __cs; }',
      'function _gtbIsMcxFuture() { return false; } function _btLtps() { return { "INDIA VIX": { ltp: __vix } }; }',
      'function _gtbOrderFlowImbalance() { return __ofi; } function generateTrend() { if (__trendLtp === null) throw new Error("x"); return { ltp: __trendLtp }; }',
    ].join(' '),
  );

/** Level confirmation checks and the Level Decision, with the browser globals stubbed. */
export const levelDecisionOracle = (): Oracle =>
  loadOracle(
    [
      {
        file: 'grootTradeBot.js',
        fns: [
          '_gtbIsITM', 'scoreOIStrikeForSignal', '_gtbFindWalls', '_gtbObvVelocityInfo', '_gtbWallVelocity', '_gtbWallErosion',
          '_gtbLevelWallCheck', '_gtbRoomToTargetCheck', '_gtbFuturesTrendCheck', '_gtbIvSkewCheck', '_gtbWeakStrongIndexCheck', '_gtbComponentsCheck', '_gtbBroadBasedCheck',
          '_gtbLevelHistory', '_gtbLevelDecision', '_gtbLevelDecisionCore',
        ],
      },
    ],
    [
      'var __store = {}; var __trend = null; var __hl = { ms: null, score: null }; var __lp = null; var __sq = []; var __dz = false; var __nowMin = 600;',
      'var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; } };',
      'var INSTRUMENT_SCORE_MAP = {}; var _GTB_OBV_BASELINE_SAMPLES = 8; var CURRENT_DAY = "D"; var LEVEL_ROOM_MULT;',
      'var _GTB_DEC_AT_LEVEL_STEPS = 0.5, _GTB_DEC_WAIT_UNTIL_MIN = 10 * 60 + 30, _GTB_DEC_MIN_PLEVEL = 25, _GTB_DEC_MIN_TALLY = 0.75, _GTB_DEC_TREND_SEEN = {}, _GTB_DEC_TREND_WINDOW_MIN = 30;',
      'var NIFTY_50_ADVANCE_DECLINE_SCORE = 0, NIFTY_50_OI_OBV_SCORE = 0, NIFTY_BANK_ADVANCE_DECLINE_SCORE = 0, NIFTY_BANK_OI_OBV_SCORE = 0, NIFTY_50_COMPONENT_SCORE = 0, NIFTY_50_IV_SKEW_SCORE;',
      'function generateTrend() { if (!__trend) throw new Error("no trend"); return __trend; }',
      'function _gtbHeadlineMarketSignal() { return __hl; } function _gtbDecNowMin() { return __nowMin; } function _gtbLevelProb() { return __lp; }',
      'function _gtbSqueezeActiveNames() { return __sq; } function _gtbDeadZone() { return __dz ? { lo: 1, hi: 2 } : null; } function _gtbHistTime() { return ""; }',
    ].join(' '),
  );

/** getTradeSignal / getMarketSignal with the score globals and NIFTY trend stubbed. */
export const marketSignalOracle = (): Oracle =>
  loadOracle(
    [
      { file: 'grootTradeBot.js', fns: ['getTradeSignal', '_gtbVixGuardText', 'getMarketSignal'] },
    ],
    [
      'var _gtbNorm915 = function (v) { return (v === "AST") ? "ASO" : (v === "BST") ? "BSO" : (v || "B/W"); };',
      'var GTB_STRAT_LOOKUP = ' + JSON.stringify(GTB_STRAT_LOOKUP_FOR_TESTS) + ';',
      'var __trend = null; var INSTRUMENT_SCORE_MAP = {}; var __lead = 0;',
      'function generateTrend() { if (!__trend) throw new Error("x"); return __trend; }',
      'var ALL_9_15_CLOSE_SCORE = 0, NIFTY_50_9_15_CLOSE_SCORE = 0, NIFTY_BANK_9_15_CLOSE_SCORE = 0, GIFT_NIFTY_9_15_CLOSE_SCORE = 0, SENSEX_9_15_CLOSE_SCORE = 0, RELIANCE_9_15_CLOSE_SCORE = 0, HDFCBANK_9_15_CLOSE_SCORE = 0;',
      'var ALL_ADVANCE_DECLINE_SCORE = 0, NIFTY_50_ADVANCE_DECLINE_SCORE = 0, NIFTY_BANK_ADVANCE_DECLINE_SCORE = 0, ALL_FUTURES_TREND_SCORE = 0, NIFTY_50_FUTURES_TREND_SCORE = 0, NIFTY_BANK_FUTURES_TREND_SCORE = 0;',
    ].join(' '),
  );

/**
 * The market-wide scanners run as the userscript does: with a call-anything jQuery stand-in (the scores are set before any drawing) and canned history.
 * State through __hist (token -> candles), __scan (names), __levels (name -> strikeData) and the lists.
 */
export const breadthOracle = (): Oracle =>
  loadOracle(
    [
      {
        file: 'grootTradeBot.js',
        fns: ['getFuturesTrendScore', 'computeIntradayVwap', 'computeFuturesSignals', 'showTableAiNiftyPrediction', 'showAdvacenDeclineScanner', 'showFuturesTrend'],
      },
    ],
    [
      'var __hist = {}; var __scan = []; var __levels = {}; var __day = {}; var __fut = []; var __prev = {}; var scriptsVolumeMap = {};',
      'var NIFTY_50_LIST = []; var NIFTY_BANK_LIST = []; var NIFTY_50_WEIGHTED_STOCKS = {}; var NIFTY_BANK_WEIGHTED_STOCKS = {}; var FO_LIST = [];',
      'var ALL_ADVANCE_DECLINE_SCORE = 0, NIFTY_50_ADVANCE_DECLINE_SCORE = 0, NIFTY_BANK_ADVANCE_DECLINE_SCORE = 0, ALL_FUTURES_TREND_SCORE = 0, NIFTY_50_FUTURES_TREND_SCORE = 0, NIFTY_BANK_FUTURES_TREND_SCORE = 0;',
      'var ALL_ADVANCE_DECLINE_SAMPLE = 0, ALL_ADVANCE_DECLINE_UNIVERSE = 0, GTB_AD_INTERVAL_HISTORY = [], GTB_COMPONENT_CLOSE_MAP = {}, globalFuturesTrend = {}, GTB_LAST_FUT_REMARK = {}, INSTRUMENT_SCORE_MAP = {}, INSTRUMENT_TOKENS = {};',
      'var FUTURE_INTRUMENT_LIST = []; var COMMODITIES_FUTURE_INSTRUMENT_LIST = []; var futures;',
      'var dogImage = "", bullImage = "", bearImage = "", hulkImage = "", captain = "", loki = "", ironMan = "", thor = "", hulkImageNew = "", doctor_strange = "";',
      'function generateTrends() { var o = {}; Object.keys(__levels).forEach(function (n) { o[n] = { strikeData: __levels[n] }; }); return o; }',
      'function getActiveScanList() { return __scan; } function _gtbProgress() {} function _gtbTrimCandles(c) { return c; }',
      'function _gtbCurrDay() { return "D"; } function _gtbCurrDayTo() { return "D"; } function _gtbPrevDay() { return "P"; } function _gtbDataStamp() { return "t"; } function _gtbSyncFutStrip() {}',
      'async function getHistoricalDataUsingPromise(token, from, to, interval) { var k = token + "|" + interval; if (!(k in __hist)) throw new Error("none"); return { data: { candles: __hist[k] } }; }',
      'var __anything = function () { return __anything; }; var jQ0 = jQ;',
      'var jQ = new Proxy(function () { return jQ.__chain; }, { get: function (t, k) { if (k === "each") return jQ0.each; if (k === "inArray") return jQ0.inArray; if (k === "__chain") return __chainP; return undefined; } });',
      'var __chainP = new Proxy(function () { return __chainP; }, { get: function (t, k) { if (k === Symbol.toPrimitive) return function () { return ""; }; return __chainP; }, apply: function () { return __chainP; } });',
      'var c3 = { generate: function () { return {}; } }; var ApexCharts = function () { return { render: function () {} }; };',
      'function _renderBarChart() {} function _gtbRenderAD() {}',
    ].join(' '),
  );

/** The Final Verdict with its inputs stubbed (consensus, market signal, decisions, 9:15 plan through globals). */
export const finalVerdictOracle = (): Oracle =>
  loadOracle(
    [
      { file: 'grootTradeBot.js', fns: ['_gtbDeadZoneText', '_gtbFinalVerdictCore', '_gtbFinalVerdict'] },
    ],
    [
      'var __cn = {}; var __cb = {}; var __hl = { ms: null, score: null }; var __dec = {}; var __huText = null; var __spot = 24000; var __lx = null; var __store = {};',
      'var window = { _GTB_LC: {} }; var _GTB_DZ_BUFFER_PCT = 0.05; var _GTB_FV_HIGH_NET = 0.5, _GTB_FV_HIGH_GROUPS = 4, _GTB_FV_MED_NET = 0.3, _GTB_FV_MED_GROUPS = 3;',
      'var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; } };',
      'function _gtbMasterConsensus(n) { return n === "NIFTY 50" ? __cn : __cb; } function _gtbHeadlineMarketSignal() { return __hl; }',
      'function _gtbDecisionFor(nm, side) { return __dec[side] || null; } function _gtbLevelConfirmSideHtml() {} function _gtbSqueezeHeadsUp() { return __huText; }',
      'function _gtbNorm915(v) { return v === "AST" ? "ASO" : v === "BST" ? "BSO" : (v || "B/W"); } function _ii() { return ""; }',
      'function generateTrend() { return { ltp: String(__spot) }; } function _lxCompute() { return __lx; } function _gtbExpiryDayNames() { return []; } function _gtbExpiryContext() { return null; }',
    ].join(' '),
  );

/** Strong support / resistance and the Probable trade, with their data sources stubbed (state through __trend, __sd, __pv, __cn, __lx, __fv and INSTRUMENT_SCORE_MAP). */
export const outlookOracle = (): Oracle =>
  loadOracle(
    [
      {
        file: 'grootTradeBot.js',
        fns: [
          '_gtbIsITM', 'scoreOIStrikeForSignal', '_gtbFindWalls', '_gtbObvVelocityInfo', '_gtbWallVelocity', '_gtbWallErosion', '_gtbComputeMaxPainGEX', '_gtbMarketProfile',
          '_gtbSrLevels', '_gtbOutlook', '_gtbOlHoldLoad', '_gtbOlHoldSave', '_gtbOlStabilise',
        ],
      },
    ],
    [
      'var __trend = null; var __sd = null; var __pv = null; var __cn = {}; var __lx = null; var __fv = null; var __now = 0; var __store = {};',
      'var INSTRUMENT_SCORE_MAP = {}; var INSTRUMENT_LIST_GLOBAL = [{ name: "X", price: 24000 }]; var INSTRUMENT_TOKENS = {}; var _GTB_OBV_BASELINE_SAMPLES = 8; var window = { _GTB_LC: {} };',
      'var _GTB_SR_NAME = "NIFTY 50", _GTB_SR_PREV = {}, _GTB_SR_TOL = 0.12; var _GTB_OL_NAME = "NIFTY 50", _GTB_OL_NEAR_PCT = 0.15, _GTB_OL_STOP_BUF_PCT = 0.12, _GTB_OL_MIN_STRENGTH = 2;',
      'var _GTB_OL_HOLD = null, _GTB_OL_HOLD_MIN = 4, _GTB_OL_HOLD_TOL_PCT = 0.15; var _GTB_FV_HIGH_NET = 0.5, _GTB_FV_HIGH_GROUPS = 4, _GTB_FV_MED_NET = 0.3, _GTB_FV_MED_GROUPS = 3;',
      'var CURRENT_DAY = moment().format("YYYY-MM-DD");',
      'var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; }, setItem: function (k, v) { __store[k] = String(v); } };',
      'var _RealDate = Date; var Date = new Proxy(_RealDate, { get: function (t, k) { if (k === "now") return function () { return __now; }; return t[k]; } });',
      'function generateTrend() { if (!__trend) throw new Error("no trend"); return __trend; } function getStrikeDetails() { if (!__sd) throw new Error("no sd"); return __sd; }',
      'function _gtbSrIsMcx() { return false; } function _gtbSrPrevLoad() { return __pv; } function _gtbMasterConsensus() { return __cn; } function _lxCompute() { return __lx; }',
      'function _gtbDeadZone() { return null; } function _gtbFinalVerdict() { return __fv; } function _gtbHistTime() { return ""; }',
    ].join(' '),
  );

/** Live Context (liveContext.js) with the browser globals stubbed. */
export const liveContextOracle = (): Oracle =>
  loadOracle(
    [
      { file: 'liveContext.js', fns: ['_lxJson', '_lxF', '_lxP', '_lxSgn', '_lxDay', '_lxLogKey', '_lxCandles', '_lxMinus', '_lxMin', '_lxHistLoad', '_lxBreadth', '_lxFut', '_lxChecks', '_lxViewDir', '_lxCompute', '_lxGateFor'] },
    ],
    [
      'var _LX_HIST = [], _LX_HIST_DAY = "", _LX_HEAVY = { key: "", at: 0, oi: null }; var __store = {}; var __now = 0; var __trend = null;',
      'var INSTRUMENT_SCORE_MAP = {}; var NIFTY_50_LIST = []; var NIFTY_50_WEIGHTED_STOCKS = {}; var NIFTY_BANK_WEIGHTED_STOCKS = {}; var window = { _GTB_LAST_SCORE: null };',
      'var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; } };',
      'var _RealDate = Date; var Date = new Proxy(_RealDate, { get: function (t, k) { if (k === "now") return function () { return __now; }; return t[k]; } });',
      'var GTB_STRAT_LOOKUP = {}; function _gtbNorm915(v) { return v === "AST" ? "ASO" : v === "BST" ? "BSO" : (v || "B/W"); }',
      'function generateTrend() { if (!__trend) throw new Error("none"); return __trend; }',
    ].join(' '),
  );

/** Signal agreement and entry timing (optionStrikeSearch.js) with their data sources stubbed. */
export const signalOracle = (): Oracle =>
  loadOracle(
    [
      { file: 'optionStrikeSearch.js', fns: ['_ossIndiaVix', '_ossDirPick', '_ossSuggestedKey', '_ossAgreement', '_ossTimingRangeChecks', '_ossTimingFor'] },
    ],
    [
      'var __store = {}; var __hl = { ms: null, score: null }; var __fv = null; var __cs = null; var __tr = null; var __lp = null; var __dz = null; var __nowMin = 600;',
      'var INSTRUMENT_SCORE_MAP = {}; var _PS_CACHE = {}; var _OSS_LOW_VIX = 13; var _OSS_AGREE_LAST = null; var _OSS_TIMING_LAST = null;',
      'var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; } };',
      'function _ossIsMcx() { return false; } function _gtbHeadlineMarketSignal() { return __hl; } function _gtbFinalVerdict() { return __fv; }',
      'function computeInstrumentScore() { if (!__cs) throw new Error("none"); return __cs; } function _ossTrend() { if (!__tr) throw new Error("none"); return __tr; }',
      'function _gtbLevelProb() { return __lp; } function _gtbDeadZone() { return __dz; } function _gtbDecNowMin() { return __nowMin; }',
    ].join(' '),
  );

/** The futures remark accuracy replay (the futures functions plus `_gtbReconstructFutAccuracy`). */
export const futAccuracyOracle = (): Oracle =>
  loadOracle([{ file: 'grootTradeBot.js', fns: ['getFuturesTrendScore', 'computeIntradayVwap', 'computeFuturesSignals', '_gtbRemarkFromSignals', '_gtbClassifyFutures', '_gtbReconstructFutAccuracy'] }]);

/** The 9:15 combo backtest (grootTradeBot.js + the strike functions of utils.js) with history and storage stubbed. */
export const comboOracle = (): Oracle =>
  loadOracle(
    [
      { file: 'utils.js', fns: ['getStrikeDiff', 'getStrikeDetails'] },
      { file: 'grootTradeBot.js', fns: ['_gtbClassify915', '_gtbSimLeg', '_gtbLegsFor', '_gtbFetch5minRange', '_gtbBuild915Trend'] },
    ],
    [
      'var __store = {}; var __hist = {}; var NSE_STRIKE_DIFF = {}; var INSTRUMENT_TOKENS = {}; var _GTB_915_TREND_VER = "v8";',
      'var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; }, setItem: function (k, v) { __store[k] = String(v); } };',
      'function _gtbLsSet(k, v) { __store[k] = v; return true; } function _gtbNoteMissingStep() {}',
      'var _gtbNorm915 = function (v) { return (v === "AST") ? "ASO" : (v === "BST") ? "BSO" : (v || "B/W"); }; var GTB_STRAT_LOOKUP = ' + JSON.stringify(GTB_STRAT_LOOKUP_FOR_TESTS) + ';',
      'async function getHistoricalDataUsingPromise(token, from, to, interval) { var all = __hist[token + "|" + interval] || []; var c = all.filter(function (k) { var d = String(k[0]).slice(0, 10); return d >= from && d <= to; }); return { data: { candles: c } }; }',
    ].join(' '),
  );

/** Predict (9:15 combo): `_gtbBuildPrediction` with its numbers copied to __PRED just before it starts building HTML. */
export const predictOracle = (): Oracle =>
  loadOracle(
    [
      { file: 'utils.js', fns: ['getStrikeDiff', 'getStrikeDetails'] },
      {
        file: 'grootTradeBot.js',
        fns: ['_gtbBuildPrediction'],
        patch: {
          _gtbBuildPrediction: (src) => {
            const marker = '// ── Render';
            if (!src.includes(marker)) throw new Error('render marker not found');
            return src.replace(marker, '__PRED = { comboKey: comboKey, strat: strat, comboStats: comboStats, nudges: nudges, bullP: bullP, bearP: bearP, sidewaysP: sidewaysP, vixRegime: vixRegime, noTrade: noTrade, atVIXU: atVIXU, atVIXL: atVIXL, confidence: confidence, leadLagConflict: leadLagConflict, tradeAction: tradeAction, tradeEntry: tradeEntry, tradeTarget: tradeTarget, tradeStop: tradeStop, scenarios: scenarios, primaryBull: primaryBull, primaryBear: primaryBear }; throw new Error("__stop"); ' + marker);
          },
        },
      },
    ],
    [
      'var __store = {}; var __PRED = null; var __trend = null; var __gate = null; var NSE_STRIKE_DIFF = {}; var INSTRUMENT_SCORE_MAP = {}; var _GTB_915_TREND_VER = "v8";',
      'var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; } };',
      'function _gtbNoteMissingStep() {} var _gtbNorm915 = function (v) { return (v === "AST") ? "ASO" : (v === "BST") ? "BSO" : (v || "B/W"); }; var GTB_STRAT_LOOKUP = ' + JSON.stringify(GTB_STRAT_LOOKUP_FOR_TESTS) + ';',
      'var ALL_9_15_CLOSE_SCORE = 0, NIFTY_50_9_15_CLOSE_SCORE = 0, NIFTY_BANK_9_15_CLOSE_SCORE = 0, GIFT_NIFTY_9_15_CLOSE_SCORE = 0, SENSEX_9_15_CLOSE_SCORE = 0;',
      'var ALL_ADVANCE_DECLINE_SCORE = 0, NIFTY_50_ADVANCE_DECLINE_SCORE = 0, NIFTY_BANK_ADVANCE_DECLINE_SCORE = 0, ALL_FUTURES_TREND_SCORE = 0, NIFTY_50_FUTURES_TREND_SCORE = 0, NIFTY_BANK_FUTURES_TREND_SCORE = 0;',
      'var NIFTY_50_OI_OBV_SCORE = 0, NIFTY_BANK_OI_OBV_SCORE = 0, NIFTY_50_MAX_PAIN_SCORE = 0, NIFTY_BANK_MAX_PAIN_SCORE = 0, NIFTY_50_IV_SKEW_SCORE = 0, NIFTY_BANK_IV_SKEW_SCORE = 0, NIFTY_50_COMPONENT_SCORE = 0, NIFTY_BANK_COMPONENT_SCORE = 0;',
      'function generateTrend() { if (!__trend) throw new Error("none"); return __trend; } function _lxGateFor(n, d) { return typeof __gate === "function" ? __gate(d) : null; }',
    ].join(' '),
  );

/** Fear & Greed (grootTradeBot.js) with the breadth globals, the VIX quote and the momentum cache stubbed. */
export const fearGreedOracle = (): Oracle =>
  loadOracle(
    [{ file: 'grootTradeBot.js', fns: ['_gtbFearGreedComponents', '_gtbFearGreedLabel', '_gtbFearGreedOutcome'] }],
    [
      'var ALL_ADVANCE_DECLINE_SCORE = 0, ALL_ADVANCE_DECLINE_SAMPLE = 0, ALL_ADVANCE_DECLINE_UNIVERSE = 0, GTB_FG_BREADTH_MIN_COVERAGE = 0.15;',
      'var __vix = 0; var localStorage = { getItem: function () { return JSON.stringify({ "INDIA VIX": { ltp: __vix } }); } };',
      'var _GTB_FG_MOMENTUM = { value: null, date: null };',
    ].join(' '),
  );

/** Squeeze signal, pre-squeeze score and the past-episode study (grootTradeBot.js) with the dashboard state stubbed. */
export const squeezeOracle = (): Oracle =>
  loadOracle(
    [{ file: 'grootTradeBot.js', fns: ['_gtbShortCoveringSignal', '_gtbPreSqueezeScore', '_gtbSqzPctile', '_gtbSqzStats', '_gtbSqzEpisodesForDay', '_gtbSqzFuelForDay', '_gtbSqzFuelStats', '_gtbSqzAnalyseDays'] }],
    [
      'var _GTB_SQZ_MERGE_GAP = 6, _GTB_SQZ_FUEL_STREAK = 3, _GTB_SQZ_FUEL_H = 12, _GTB_SQZ_FUEL_MIN_TRIG = 8;',
      'var INSTRUMENT_SCORE_MAP = {}; var _GTB_SQUEEZE_STREAK = {}; var __chg = 0, __ltp = 0, __days = null;',
      'function generateTrend() { return { change: __chg, ltp: __ltp }; } function _gtbDaysToExpiry() { return __days; } var setTimeout = function (f) { f(); };',
    ].join(' '),
  );

/** Expiry context (grootTradeBot.js) with max pain, walls and the trend stubbed. */
export const expiryOracle = (): Oracle =>
  loadOracle(
    [{ file: 'grootTradeBot.js', fns: ['_gtbExpiryContext'] }],
    [
      'var INSTRUMENT_SCORE_MAP = { "NIFTY 50": { oiData: { tableData: [1] } } }; var __mp = null, __walls = { resistance: [], support: [] }, __ltp = 0;',
      'function generateTrend() { return { ltp: __ltp, change: 0 }; } function _gtbComputeMaxPainGEX() { if (!__mp) throw new Error("none"); return __mp; } function _gtbFindWalls() { return __walls; }',
    ].join(' '),
  );

/** Positional screener maths (positionalScreener.js): primary read, overlay, plan and conviction. */
export const positionalOracle = (): Oracle =>
  loadOracle(
    [{ file: 'positionalScreener.js', fns: ['_psSmaArr', '_psAtr14', '_psTrendTemplate', '_psShortTemplate', '_psStage', '_psMomentum', '_psLongLevels', '_psShortLevels', '_psPrimaryRead', '_psSma', '_psComputeSetup', '_psComputeConviction', '_psAttachTradePlan', '_psIsTradeable', '_psDayStats', '_psViewSign', '_psBuildSince', '_psMedian', '_psViewEstimates', '_psMarketView'] }],
    'var _PS_STAGE_LABELS = { 1: "Stage 1 — Basing", 2: "Stage 2 — Advancing", 3: "Stage 3 — Topping", 4: "Stage 4 — Declining" }; var _PS_ATR_STOP_MULT = 1.5, _PS_ATR_TARGET_MULT = 2.5; var _PS_EXTENDED_PCT = 25.0, _PS_MILD_EXT_PCT = 10.0; var _PS_TRADEABLE_MIN_CONV = 60, _PS_TRADEABLE_AWAITING_MIN_CONV = 65, _PS_STATS_WINDOW = 250, _PS_SIGNAL_LOOKBACK = 120, _PS_TIMING_EARLY_ATR = 2.5, _PS_TIMING_LATE_ATR = 6, _PS_EST_STEP = 2, _PS_EST_MIN_RUNS = 4, _PS_PACE_DAYS = 20; var _PS_CACHE = {}, _PS_EXTRA_INSTRUMENTS = ["NIFTY 50"];',
  );

/** Order-flow imbalance (grootTradeBot.js) with the last tick and the index-name map stubbed. */
export const orderFlowOracle = (): Oracle =>
  loadOracle(
    [{ file: 'grootTradeBot.js', fns: ['_gtbOrderFlowImbalance', '_gtbOrderFlowCheck'] }],
    'var __tok = 7, __proxy = false; var _DL_INDEX_NAME_TO_DISPLAY = {}; var _QW_LAST_TICK = {}; function _gtbTokenForName() { return __tok; }',
  );

/** Macro (macro.js) with the snapshot day and the hand-set Fed rate stubbed. */
export const macroOracle = (): Oracle =>
  loadOracle(
    [{ file: 'macro.js', fns: ['_mcAnalyse', '_mcFmtChg', '_mcRead', '_mcVerdict', '_mcParseYieldText'] }],
    ['var __snap = ""; var __fed = null; function _mcSnapDay() { return __snap; } function _mcManualFed() { return __fed; }', 'var _MC_DRIVERS = ' + JSON.stringify(MACRO_DRIVERS_FOR_TESTS) + ';'].join(' '),
  );

/** Level Probability with its sources stubbed (state through __cs, __trend, __walls, __sm). */
export const levelProbOracle = (): Oracle =>
  loadOracle(
    [{ file: 'grootTradeBot.js', fns: ['_gtbLevelProb'] }],
    [
      'var __cs = null; var __trend = null; var __walls = null; var INSTRUMENT_SCORE_MAP = {};',
      'function _gtbIsMcxFuture() { return false; } function generateTrend() { if (!__trend) throw new Error("no trend"); return __trend; }',
      'function computeInstrumentScore() { if (!__cs) throw new Error("none"); return __cs; }',
      'function _gtbFindWalls() { if (__walls === "throw") throw new Error("x"); return __walls; }',
    ].join(' '),
  );

/** Master Consensus with its data sources stubbed (state is set through the sandbox globals __cs, __lp, __of, __dz). */
export const consensusOracle = (): Oracle =>
  loadOracle(
    [
      { file: 'grootTradeBot.js', fns: ['getFuturesTrendScore', '_gtbMasterConsensus'] },
    ],
    [
      'var __store = {}; var __cs = null; var __lp = null; var __of = null; var __dz = null;',
      'var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; } };',
      'var INSTRUMENT_SCORE_MAP = {};',
      'function computeInstrumentScore() { if (!__cs) throw new Error("none"); return __cs; }',
      'function _gtbLevelProb() { return __lp; } function _gtbOrderFlowImbalance() { return __of; } function _gtbDeadZoneRaw() { return __dz; }',
    ].join(' '),
  );
