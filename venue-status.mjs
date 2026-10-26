// 13회 빅분기 실기 고사장 접수 현황(마감 / 잔여 좌석)을 데이터자격검정 고사장 지도에서 가져와 venue-status.json 으로 쓴다.
// 실행: node venue-status.mjs  (Node 18+, 의존성 없음)
// .github/workflows/venue-status.yml 이 접수 기간 낮 시간에 10분마다 돌려 이 저장소 main에 커밋한다.
// 코딩팡 /venues 화면이 raw.githubusercontent.com 으로 이 JSON을 읽는다.
// 해석 함수는 코딩팡 lib/venue-status.ts(테스트 있음)를 그대로 옮긴 것 — 고치면 양쪽을 같이 고친다.
// 가져오기·해석이 실패하면 기존 파일을 그대로 두고 0이 아닌 코드로 끝난다(화면은 2시간 지나면 '지난 현황'으로 표시).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** 13회 빅분기 실기 시행 번호 (고사장 지도의 examoprSeq) */
const ROUND = 13;
const EXAMOPR_SEQ = 50248;
const INTERVAL_MIN = 10;
/** 고사장 수가 이보다 적게 오면(페이지 모양이 바뀌었거나 일부만 온 것) 덮어쓰지 않는다 — 13회는 83곳 */
const MIN_VENUES = 60;
const URL_LIST = "https://www.dataq.or.kr/www/components/map/list.do";
const REFERER = "https://www.dataq.or.kr/www/main.do";
const UA = "Mozilla/5.0 (compatible; codingpang-live)";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "venue-status.json");

// ── 해석 (코딩팡 lib/venue-status.ts 와 같음) ──
function parseVenueList(html) {
  const m = html.match(/paramsMap\.list\s*=\s*(\[[\s\S]*?\])\s*;\s*(?:\r?\n|$)/);
  if (!m) throw new Error("paramsMap.list 를 찾지 못했어요");
  const list = JSON.parse(m[1]);
  if (!Array.isArray(list) || list.length === 0) throw new Error("고사장 목록이 비어 있어요");
  return list.map((v, i) => {
    const seq = Number(v.examhallSeq);
    const seats = Number(v.seatcnt);
    const applied = Number(v.aplycnt);
    if (!Number.isInteger(seq) || !Number.isFinite(seats) || !Number.isFinite(applied) || typeof v.examhallnm !== "string") {
      throw new Error(`${i + 1}번째 고사장 값이 이상해요: ${JSON.stringify(v).slice(0, 200)}`);
    }
    return { examhallSeq: seq, areanm: String(v.areanm ?? ""), examhallnm: v.examhallnm, seatcnt: seats, aplycnt: applied, latitude: v.latitude, longitude: v.longitude };
  });
}

const stripExamPrefix = (s) => s.replace(/^\s*빅분기\s*실기\s*\([^)]*\)\s*/, "").trim();

const REGION_OF = [
  ["서울", "seoul"],
  ["경기", "gyeonggi"],
  ["인천", "incheon"],
  ["대전", "daejeon"],
  ["대구", "daegu"],
  ["부산", "busan"],
  ["광주", "gwangju"],
  ["울산", "ulsan"],
  ["강원", "gangwon"],
  ["제주", "jeju"],
];
const regionKey = (areanm) => REGION_OF.find(([k]) => areanm.startsWith(k))?.[1] ?? "";

function kstStamp(d) {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const p = (n) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

function buildVenueStatus(list, now, round) {
  const venues = list.map((r) => {
    const remaining = Math.max(0, r.seatcnt - r.aplycnt);
    return {
      id: r.examhallSeq,
      name: stripExamPrefix(r.examhallnm),
      region: regionKey(r.areanm),
      seats: r.seatcnt,
      applied: r.aplycnt,
      remaining,
      closed: remaining <= 0,
      lat: Number(r.latitude),
      lng: Number(r.longitude),
    };
  });
  venues.sort((a, b) => a.id - b.id);
  const totals = {
    venues: venues.length,
    closed: venues.filter((v) => v.closed).length,
    seats: venues.reduce((a, v) => a + v.seats, 0),
    applied: venues.reduce((a, v) => a + v.applied, 0),
    remaining: venues.reduce((a, v) => a + v.remaining, 0),
  };
  return { asOf: kstStamp(now), round, intervalMin: INTERVAL_MIN, venues, totals };
}

// ── 가져오기 ──
/** Node fetch 로 먼저, 안 되면 curl 로 한 번 더 */
async function download() {
  try {
    const res = await fetch(URL_LIST, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA, referer: REFERER },
      body: `examoprSeq=${EXAMOPR_SEQ}`,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.warn(`fetch 실패(${e?.cause?.code ?? e?.message}) — curl 로 다시 시도`);
    return execFileSync(
      "curl",
      ["-sS", "--fail", "--max-time", "30", "--retry", "2", "-A", UA, "-e", REFERER, "-X", "POST", "-d", `examoprSeq=${EXAMOPR_SEQ}`, URL_LIST],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
  }
}

/** 고사장 한 곳을 한 줄로 — 커밋 차이를 읽기 쉽게 */
function toJson(s) {
  const head = `"asOf": ${JSON.stringify(s.asOf)},\n "round": ${s.round},\n "intervalMin": ${s.intervalMin},\n "totals": ${JSON.stringify(s.totals)}`;
  return `{\n ${head},\n "venues": [\n${s.venues.map((v) => `  ${JSON.stringify(v)}`).join(",\n")}\n ]\n}\n`;
}

/** 지난 파일의 전체 접수 수 (없으면 null) */
function previousApplied() {
  try {
    return JSON.parse(fs.readFileSync(OUT, "utf8")).totals.applied;
  } catch {
    return null;
  }
}

/** 접수 수가 지난번보다 크게 줄면 원본 쪽 일시적인 값으로 보고 잠시 뒤 다시 받는다 (접수는 거의 줄지 않는다) */
const DROP_RATIO = 0.95;
async function fetchStable() {
  const prev = previousApplied();
  for (let i = 0; i < 3; i++) {
    const list = parseVenueList(await download());
    if (list.length < MIN_VENUES) throw new Error(`고사장이 ${list.length}곳뿐이에요`);
    const applied = list.reduce((a, v) => a + v.aplycnt, 0);
    if (prev === null || applied >= prev * DROP_RATIO) return list;
    console.warn(`접수 수가 ${prev} → ${applied}로 크게 줄어 30초 뒤 다시 받아요`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  return null;
}

try {
  const list = await fetchStable();
  if (!list) {
    console.warn("값이 계속 낮아 이번 갱신은 건너뛰어요(기존 파일 그대로)");
    process.exit(0);
  }
  const status = buildVenueStatus(list, new Date(), ROUND);
  const tmp = `${OUT}.tmp`;
  fs.writeFileSync(tmp, toJson(status));
  fs.renameSync(tmp, OUT);
  const t = status.totals;
  console.log(`${status.asOf} 기준 ${t.venues}곳 · 마감 ${t.closed}곳 · 잔여 ${t.remaining}석`);
} catch (e) {
  console.error(`접수 현황을 만들지 못했어요(기존 파일은 그대로): ${e?.message ?? e}`);
  process.exit(1);
}
