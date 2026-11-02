// '지수 역사' 페이지용 월별 데이터를 만든다. GitHub Actions가 시세 갱신 때 같이 돌린다.
// - S&P 500 지수(^GSPC), 나스닥100 지수(^NDX): 야후 파이낸스 월말 종가 (배당 제외 가격 지수)
// - 달러-원 환율: 미국 연준 FRED의 DEXKOUS (뉴욕 정오 환율) 중 그 달 마지막 값
//   FRED는 1~2주 늦게 올라와서, 값이 아직 없는 최근 달은 ECB 기준환율(frankfurter.dev)로 채운다.
// 결과: history.json (세 값이 모두 있는 첫 달부터 이번 달까지)
// 직접 돌려볼 때: node scripts/update-history.mjs

import { writeFile } from 'node:fs/promises';

const OUT = 'history.json';
const UA = { 'User-Agent': 'Mozilla/5.0 (personal price updater)' };

async function get(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res;
}

// 'YYYY-MM' → 값 (그 달의 마지막 값)
async function yahooMonthly(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=${now}&interval=1mo`;
  const r = (await (await get(url)).json())?.chart?.result?.[0];
  const ts = r?.timestamp;
  const close = r?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(close)) throw new Error(`${symbol}: 데이터 형식이 다름`);
  const out = new Map();
  ts.forEach((t, i) => {
    const v = close[i];
    // 월봉 시각은 그 달 1일 0시(뉴욕) = UTC 4~5시라서, UTC 날짜로 달을 정하면 된다
    if (Number.isFinite(v) && v > 0) out.set(new Date(t * 1000).toISOString().slice(0, 7), v);
  });
  return out;
}

async function fredMonthlyKrw() {
  const csv = await (await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXKOUS')).text();
  const out = new Map();
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const [date, value] = line.split(',');
    const v = Number(value);
    if (date && value && value !== '.' && Number.isFinite(v) && v > 0) out.set(date.slice(0, 7), v); // 날짜순이라 마지막 값이 남음
  }
  return out;
}

async function latestKrw() {
  const j = await (await get('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW')).json();
  const rate = j?.rates?.KRW;
  if (!(rate >= 100 && rate <= 10000)) throw new Error(`환율 값이 이상함: ${rate}`);
  return { rate, date: j.date };
}

function nextMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

const [spx, ndx, fred] = await Promise.all([yahooMonthly('^GSPC'), yahooMonthly('^NDX'), fredMonthlyKrw()]);
const fx = new Map(fred);
const lastIndexMonth = [...ndx.keys()].sort().at(-1);
let fxFilled = null;
if (!fx.has(lastIndexMonth)) {
  const latest = await latestKrw();
  fx.set(lastIndexMonth, latest.rate);
  fxFilled = { month: lastIndexMonth, source: 'ECB (frankfurter.dev)', date: latest.date };
}

// 세 값이 모두 있는 첫 달부터 한 달씩
const start = [...ndx.keys()].sort().find((k) => spx.has(k) && fx.has(k));
const months = [], spxArr = [], ndxArr = [], krwArr = [];
for (let k = start; k <= lastIndexMonth; k = nextMonth(k)) {
  if (!spx.has(k) || !ndx.has(k) || !fx.has(k)) throw new Error(`${k} 데이터가 빠짐 (spx ${spx.has(k)}, ndx ${ndx.has(k)}, fx ${fx.has(k)})`);
  months.push(k);
  spxArr.push(Math.round(spx.get(k) * 100) / 100);
  ndxArr.push(Math.round(ndx.get(k) * 100) / 100);
  krwArr.push(Math.round(fx.get(k) * 100) / 100);
}
if (months.length < 120) throw new Error(`데이터가 너무 짧음: ${months.length}개월`);

const out = {
  updated: new Date().toISOString(),
  sources: {
    index: 'Yahoo Finance 월말 종가 (^GSPC, ^NDX, 배당 제외)',
    fx: 'FRED DEXKOUS (뉴욕 정오 환율, 그 달 마지막 값)',
    fxFilled,
  },
  months,
  spx: spxArr,
  ndx: ndxArr,
  usdkrw: krwArr,
};
await writeFile(OUT, JSON.stringify(out) + '\n');
console.log(`${OUT}: ${months[0]} ~ ${months.at(-1)} (${months.length}개월)`);
console.log(`마지막 달: S&P 500 ${spxArr.at(-1)}, 나스닥100 ${ndxArr.at(-1)}, 환율 ${krwArr.at(-1)}` + (fxFilled ? ` (ECB ${fxFilled.date})` : ''));
