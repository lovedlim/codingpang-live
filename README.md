# codingpang-live
코딩팡(code.sideonai.com) 화면이 읽어 가는 공개 현황 파일. 13회 빅분기 실기 고사장 접수 현황(출처: dataq 고사장 안내)을 접수 기간 낮 시간에 약 10분마다 갱신한다.

- `venue-status.mjs` — 고사장 지도에서 좌석·접수 인원을 가져와 `venue-status.json`을 쓴다 (Node, 의존성 없음)
- `.github/workflows/venue-status.yml` — 10/26 10:00~19:00, 10/27~10/30 10:00~18:00 (KST) 10분마다 실행해 `venue-status.json`만 커밋한다. 10/30 18:30 이후로는 건너뛴다.
- 화면은 `https://raw.githubusercontent.com/lovedlim/codingpang-live/main/venue-status.json` 을 브라우저에서 읽는다.
