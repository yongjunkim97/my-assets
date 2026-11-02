# 내 자산 현황

토스에서 산 ETF의 총 평가금액, 손익, 비중을 달러와 원화로 보여주는 한 장짜리 페이지.

- 로그인 없음. 입력한 값은 그 브라우저의 localStorage에만 저장되고 어디로도 전송되지 않는다.
- 기기 간 이동은 페이지의 '백업 파일 저장 / 불러오기'로 한다.
- 원화 금액은 현재 환율로 단순 환산한 값이다.

## 시세 자동 갱신

- `.github/workflows/update-prices.yml`이 평일 21:30 UTC(한국 06:30)에 `scripts/update-prices.mjs`를 돌린다.
- 스크립트는 `tickers.txt`의 종목 가격(Yahoo Finance)과 달러-원 환율(ECB, frankfurter.dev)을 받아 `prices.json`에 커밋한다.
- 페이지는 열릴 때 `prices.json`을 읽어 현재가와 환율을 바꾼다. 페이지 위쪽의 '끄기'로 끌 수 있다.
- 자동으로 받을 종목을 늘리려면 `tickers.txt`에 티커를 한 줄 추가한다.
- 바로 갱신하려면 GitHub의 Actions 탭 → '시세 자동 갱신' → Run workflow.
- API 키는 쓰지 않는다. Yahoo Finance 주소는 공식 API가 아니라서 언젠가 막힐 수 있다. 그때는 실패한 종목만 이전 값이 유지된다.
