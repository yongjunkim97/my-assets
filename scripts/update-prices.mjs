// GitHub Actions가 평일마다 실행하는 스크립트.
// tickers.txt에 적힌 종목의 최신 가격(야후 파이낸스)과
// 달러-원 환율(ECB 기준환율, frankfurter.dev)을 받아 prices.json에 저장한다.
// 직접 돌려볼 때: node scripts/update-prices.mjs

import { readFile, writeFile } from 'node:fs/promises';

const OUT = 'prices.json';

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (personal price updater)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 종목 하나의 최신 가격. 미국 장 마감 뒤에 돌리면 그날 종가가 된다.
async function fetchPrice(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
  const meta = (await getJson(url))?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const time = meta?.regularMarketTime;
  if (meta?.currency !== 'USD') throw new Error(`통화가 USD가 아님 (${meta?.currency})`);
  if (!(Number.isFinite(price) && price > 0) || !Number.isFinite(time)) throw new Error('가격을 읽지 못함');
  return { price, time: new Date(time * 1000).toISOString() };
}

// 1달러 = ?원 (ECB가 유럽 시간 오후 4시쯤 하루 한 번 발표하는 기준환율)
async function fetchFx() {
  const j = await getJson('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW');
  const rate = j?.rates?.KRW;
  if (!(rate >= 100 && rate <= 10000)) throw new Error(`환율 값이 이상함: ${rate}`);
  return { rate, date: j.date, source: 'ECB (frankfurter.dev)' };
}

const tickers = (await readFile('tickers.txt', 'utf8'))
  .split(/\r?\n/)
  .map((line) => line.replace(/#.*/, '').trim().toUpperCase())   // # 뒤는 메모
  .filter(Boolean);

// 지난번 값. 이번에 실패한 항목은 이전 값을 그대로 둔다.
let old = {};
try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* 처음 실행 */ }

const out = { updated: new Date().toISOString(), fx: old.fx ?? null, prices: {} };
let ok = 0;

for (const t of tickers) {
  try {
    out.prices[t] = await fetchPrice(t);
    ok++;
    console.log(`${t}: $${out.prices[t].price} (${out.prices[t].time})`);
  } catch (e) {
    console.log(`::warning::${t} 가격을 못 받음: ${e.message}`);
    if (old.prices?.[t]) out.prices[t] = old.prices[t];
  }
}

try {
  out.fx = await fetchFx();
  ok++;
  console.log(`USD/KRW: ${out.fx.rate} (${out.fx.date})`);
} catch (e) {
  console.log(`::warning::환율을 못 받음: ${e.message}`);
}

if (ok === 0) {
  console.error('가격과 환율을 하나도 받지 못해서 prices.json을 바꾸지 않음');
  process.exit(1);
}

await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`${OUT} 저장 완료`);
