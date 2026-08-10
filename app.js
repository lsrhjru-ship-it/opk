/* ============================================================================
   경찰청 인트라넷 — 백엔드 API 연동 + 법률 계산기 + RP 보고서 통합 버전
   (계급별 등급 분류 및 권한 관리 시스템 적용)
   ============================================================================ */

const API_BASE = "https://lsrhjru.wisp.uno/api";

// 전체 계급 목록
const RANKS = ["처장", "교육원장", "차관보", "관리관", "이사관", "비서실장", "부이사관", "서기관", "사무관", "주사", "주사보", "서기", "서기보", "경찰청 1등급", "경찰청 2등급"];

let TOKEN = localStorage.getItem("bureau_token") || null;
let SESSION = JSON.parse(localStorage.getItem("bureau_session") || "null");
let DATA = null;
let TAB = "dash";
let VIEW = "gate";
let LAST = {};

// 자동 새로고침(폴링) 설정
const POLL_INTERVAL_MS = 15000; // 15초마다 서버 데이터 재조회
let pollTimer = null;
let LAST_SNAPSHOT = null; // 마지막으로 렌더링한 데이터의 스냅샷 (변경 감지용)

/* ------------------------------ 계급 및 권한 유틸 ------------------------------ */

// 계급에 따른 등급 분류 헬퍼 함수
function getRankCategory(rank) {
  if (["처장", "교육원장", "차관보", "관리관", "이사관", "비서실장"].includes(rank)) return "고위직";
  if (["부이사관", "서기관", "사무관", "주사"].includes(rank)) return "간부직";
  if (["주사보", "서기", "서기보", "1등급", "2등급"].includes(rank)) return "일반직";
  return "일반직";
}

// 특정 기능 권한 보유 여부 확인 함수
// permKey: 'members' | 'attendance' | 'notices' | 'apps' | 'warn'
function hasPermission(permKey) {
  if (!SESSION) return false;
  // 팩션장(isOwner)이거나 처장인 경우 모든 권한 허용
  if (SESSION.isOwner || SESSION.rank === "처장") return true;

  // 부여된 권한 목록 배열 확인
  const userPerms = SESSION.permissions || [];
  return userPerms.includes(permKey);
}

// 권한에 따른 접근 가능한 탭 목록 반환
function getAccessibleTabs() {
  const baseTabs = [
    { key: "dash", label: "대시보드" },
    { key: "rpreport", label: "RP 보고서" },
    { key: "lawcalc", label: "법률 계산기" },
    { key: "notices", label: "사이드 공지" },
  ];

  if (hasPermission("members")) baseTabs.push({ key: "members", label: "팩션원 관리" });
  if (hasPermission("attendance")) baseTabs.push({ key: "attendance", label: "근태 관리" });
  if (hasPermission("apps")) baseTabs.push({ key: "apps", label: "가입 신청" });
  if (hasPermission("warn")) baseTabs.push({ key: "warn", label: "내부경고" });

  // 팩션장/최고 임원 전용 관리 메뉴
  if (SESSION && (SESSION.isOwner || SESSION.rank === "처장")) {
    baseTabs.push({ key: "accounts", label: "계정/권한 관리" });
    baseTabs.push({ key: "settings", label: "설정" });
  }

  return baseTabs;
}

/* ------------------------------ 고유번호 앞 00 제거 헬퍼 ------------------------------ */

function formatBadge(badge) {
  if (!badge) return "-";
  const cleaned = String(badge).replace(/^0+/, '');
  return cleaned === "" ? "0" : cleaned;
}

/* ------------------------------ 법률 계산기 전용 데이터 ------------------------------ */

const LAW_DATA = [
  { category: "건물 알피", name: "편의점", fine: "50,000,000원", detention: "10분", process: "공표 허가 -> 벨 울림 -> 사이드공지 2회 -> 무력진압 3회", etc: "경관 재량 무기 압수 / 금지자리 필수 확인" },
  { category: "건물 알피", name: "ATM", fine: "50,000,000원", detention: "10분", process: "공표 허가 -> 벨 울림 -> 사이드공지 2회 -> 무력진압 3회", etc: "경관 재량 무기 압수 / 금지자리 필수 확인" },
  { category: "건물 알피", name: "젤리가게", fine: "300,000,000원", detention: "15분", process: "공표 허가 -> 벨 울림 -> 사이드공지 2회 -> 무력진압 3회", etc: "금지자리 필수 확인" },
  { category: "건물 알피", name: "빈집털이", fine: "40,000,000원", detention: "5분", process: "공표 허가 -> 벨 울림 -> 사이드공지 2회 -> 무력진압 3회", etc: "경관 재량 무기 압수" },
  { category: "건물 알피", name: "보석", fine: "120,000,000원", detention: "20분", process: "공표 허가 -> 벨 울림 -> 사이드공지 2회 -> 무력진압 3회", etc: "구금 최소 10분" },
  { category: "건물 알피", name: "경찰서 털이1차", fine: "200,000,000원", detention: "", process: "공표 허가 -> 벨 울림 -> 사이드공지 2회 -> 무력진압 3회", etc: "금지자리 필수 확인" },
  { category: "건물 알피", name: "경찰서 털이2차", fine: "200,000,000원", detention: "40분", process: "공표 허가 -> 벨 울림 -> 사이드공지 2회 -> 무력진압 3회", etc: "구금 최소 10분 / 금지자리 필수 확인" },
  { category: "차량 알피", name: "도주", fine: "150,000,000원", detention: "10분", process: "PM 3회 -> 미 정차 -> 2분내로 도주자 등록 / 위치 추적 가능", etc: "무기 압수 필수 / 범위 이탈 도주자 사격 금지" },
  { category: "차량 알피", name: "수배", fine: "300,000,000원", detention: "20분", process: "미 출석 -> 수배 시작 사이드 공지 / 위치 추적 가능", etc: "무기 압수 필수 / 수배 참여자 2억원 구금 15분 무기 압수" },
  { category: "차량 알피", name: "긴급수배", fine: "300,000,000원", detention: "20분", process: "수배 시작 사이드 공지 / 위치 추적 가능", etc: "차량 탈취(운행), 공무원(살인, 폭행, 차량파손) 시 출석 없이 목격 5분 이내" },
  { category: "차량 알피", name: "즉흥", fine: "200,000,000원", detention: "30분", process: "경범죄 3회 이상 + PM 3번 + 선발포 또는 대응사격 -> 즉흥", etc: "무기 압수 필수 / 10분 이내 지원" },
  { category: "영장", name: "영장", fine: "400,000,000원", detention: "40분", process: "수배자가 사유지 진입 -> 영장 전환 사공 2회 -> 사유지 도착 후 공표 -> 5분 후 무력진압 3회", etc: "무기와 불법 물건 필수 압수" },
  { category: "경범죄", name: "소음공해", fine: "4,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "불법주정차", fine: "5,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "속도위반 (일반도로)", fine: "5,000,000원", detention: "", process: "", etc: "일반도로 (150km 이상)" },
  { category: "경범죄", name: "속도위반 (고속도로)", fine: "10,000,000원", detention: "", process: "", etc: "고속도로 (220km 이상)" },
  { category: "경범죄", name: "신호위반", fine: "5,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "진로방해", fine: "5,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "불법유턴", fine: "5,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "역주행", fine: "5,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "차선위반", fine: "5,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "인도주행", fine: "5,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "공공기물 파손", fine: "5,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "스턴트", fine: "10,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "차량파손", fine: "10,000,000원", detention: "", process: "", etc: "" },
  { category: "경범죄", name: "뺑소니", fine: "20,000,000원", detention: "", process: "", etc: "합의 시 처벌 불가" },
  { category: "경범죄", name: "난폭운전", fine: "25,000,000원", detention: "20분", process: "", etc: "도로교통법 등 3건 이상 위반" },
  { category: "경범죄", name: "폭주", fine: "30,000,000원", detention: "20분", process: "", etc: "400km 이상 주행 시" },
  { category: "경범죄", name: "보복운전", fine: "50,000,000원", detention: "20분", process: "", etc: "" },
  { category: "경범죄", name: "무허가 항공기 운행", fine: "300,000,000원", detention: "60분", process: "", etc: "" },
  { category: "중범죄", name: "방조/공범죄", fine: "범죄자와 동일", detention: "", process: "", etc: "구금 시 해당 불법 물건/무기 개별 처벌" },
  { category: "중범죄", name: "명예훼손", fine: "10,000,000원", detention: "10분", process: "", etc: "" },
  { category: "중범죄", name: "폭행", fine: "50,000,000원", detention: "20분", process: "", etc: "" },
  { category: "중범죄", name: "불법 물건 소지", fine: "60,000,000원", detention: "20분", process: "", etc: "" },
  { category: "중범죄", name: "불법 총기 소지", fine: "80,000,000원", detention: "30분", process: "", etc: "" },
  { category: "중범죄", name: "불법무기/물건언급", fine: "40,000,000원", detention: "20분", process: "", etc: "채팅포함, 은어를 사용하지 않을 시" },
  { category: "중범죄", name: "증거 인멸", fine: "100,000,000원", detention: "20분", process: "", etc: "" },
  { category: "중범죄", name: "차량 절도", fine: "30,000,000원", detention: "30분", process: "", etc: "" },
  { category: "중범죄", name: "시민 살인", fine: "200,000,000원", detention: "30분", process: "", etc: "" },
  { category: "중범죄", name: "납치/유괴", fine: "200,000,000원", detention: "30분", process: "", etc: "" },
  { category: "중범죄", name: "사기", fine: "30,000,000원", detention: "20분", process: "", etc: "" },
  { category: "중범죄", name: "업무/영업 방해", fine: "30,000,000원", detention: "10분", process: "", etc: "" },
  { category: "중범죄", name: "공갈 협박", fine: "50,000,000원", detention: "20분", process: "", etc: "" },
  { category: "중범죄", name: "특수 폭행", fine: "50,000,000원", detention: "20분", process: "", etc: "" }
];

let LAW_SELECTED = new Set();
let LAW_CAT = "전체";
let LAW_SEARCH = "";
let LAW_LAST_CLICKED = null;

// 사이드 공지 검색 상태
let NOTICE_SEARCH = "";

/* ------------------------------ API 연동 유틸 ------------------------------ */

async function apiCall(endpoint, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, config);
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || "서버 통신 중 오류가 발생했습니다.");
    return result;
  } catch (err) {
    showToast(err.message, "danger");
    throw err;
  }
}

async function fetchFactionData() {
  if (!TOKEN) return;
  try {
    const res = await apiCall("/faction/data");
    const newData = res.faction;
    const isFirstLoad = DATA === null; // 아직 셸(화면 껍데기)이 그려지기 전인지 여부

    // 본인 계정의 최신 계급/권한을 세션에 동기화
    let newSessionBits = null;
    if (SESSION) {
      const me = newData.accounts.find(a => String(a.id) === String(SESSION.id));
      if (!me) {
        return logout();
      }
      newSessionBits = { rank: me.rank, permissions: me.permissions || [], isOwner: !!me.isOwner };
    }

    const snapshot = JSON.stringify({ data: newData, session: newSessionBits });
    const changed = snapshot !== LAST_SNAPSHOT;
    LAST_SNAPSHOT = snapshot;

    DATA = newData;
    if (SESSION && newSessionBits) {
      SESSION.rank = newSessionBits.rank;
      SESSION.permissions = newSessionBits.permissions;
      SESSION.isOwner = newSessionBits.isOwner;
      localStorage.setItem("bureau_session", JSON.stringify(SESSION));
    }

    if (changed) {
      if (isFirstLoad) render(); else silentSync();
    }
  } catch (e) {
    logout();
  }
}

/* ------------------------------ 자동 새로고침(폴링) ------------------------------ */

function isUserTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

async function pollTick() {
  if (!TOKEN || !SESSION) { stopPolling(); return; }
  if (document.hidden) return; // 탭이 백그라운드면 건너뜀
  if (isUserTyping()) return;  // 입력 중이면 건너뜀 (포커스/커서 보존)
  await fetchFactionData();
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollTick, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// 탭이 다시 보이게 되는 순간 즉시 한 번 최신화 (백그라운드에 머무는 동안 놓친 변경 반영)
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && TOKEN && SESSION && !isUserTyping()) {
    fetchFactionData();
  }
});

function showToast(msg, kind) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); padding:12px 20px; background:var(--panel2); color:var(--text); border-radius:var(--radius-sm); box-shadow:var(--shadow-lg); z-index:9999; display:none; font-size:14px; font-weight:600; border:1px solid var(--line);";
    document.body.appendChild(el);
  }
  el.textContent = (kind === "danger" ? "⚠ " : "✓ ") + msg;
  el.style.borderLeft = kind === "danger" ? "4px solid var(--danger)" : "4px solid var(--ok)";
  el.style.display = "block";
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => { el.style.display = "none"; }, 2600);
}

const LOGO_URL = "https://cdn.discordapp.com/attachments/1531501210610434168/1536237644843982888/8D4AAAAASUVORK5CYII.png?ex=6a7aac4c&is=6a795acc&hm=68f874315d648df6b51ad41a2ee748aeddb8f6c7d930768b3d17a21a3180d580";

function sealSvg(size) {
  return `<img src="${LOGO_URL}" alt="경찰청 로고" class="bureau-logo-img" crossorigin="anonymous" style="width:${size}px; height:${size}px;" />`;
}

function logout() {
  stopPolling();
  TOKEN = null;
  SESSION = null;
  DATA = null;
  LAST_SNAPSHOT = null;
  localStorage.removeItem("bureau_token");
  localStorage.removeItem("bureau_session");
  VIEW = "gate";
  render();
}

function formatDisplayDateTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------ 최상위 렌더 ------------------------------ */

function render() {
  const app = document.getElementById("app");
  if (!SESSION || !TOKEN) {
    if (VIEW === "gate") app.innerHTML = renderGate();
    else if (VIEW === "create") app.innerHTML = renderCreate();
    else if (VIEW === "createDone") app.innerHTML = renderCreateDone();
    else if (VIEW === "join") app.innerHTML = renderJoin();
    else if (VIEW === "joinSent") app.innerHTML = renderJoinSent();
    else app.innerHTML = renderLogin();
    return;
  }
  if (!DATA) {
    app.innerHTML = `<div style="min-height:100vh; display:flex; align-items:center; justify-content:center; color:var(--muted);">데이터를 불러오는 중입니다...</div>`;
    return;
  }

  // 현재 탭이 권한 밖으로 밀려났다면 dash로 초기화
  const activeTabs = getAccessibleTabs();
  if (!activeTabs.find(t => t.key === TAB)) TAB = "dash";

  const prevScroll = document.getElementById("mainScroll");
  const scrollTop = prevScroll ? prevScroll.scrollTop : 0;

  app.innerHTML = renderShell(activeTabs);

  const nextScroll = document.getElementById("mainScroll");
  if (nextScroll) nextScroll.scrollTop = scrollTop;
}

function refreshTab() {
  const tabEl = document.getElementById("tabContent");
  if(tabEl) tabEl.innerHTML = renderTab();
}

function silentSync() {
  const app = document.getElementById("app");
  if (!app || !document.getElementById("tabContent") || !SESSION || !TOKEN || !DATA) {
    render();
    return;
  }

  const activeTabs = getAccessibleTabs();
  if (!activeTabs.find(t => t.key === TAB)) TAB = "dash";

  const navEl = document.getElementById("navTabs");
  if (navEl) navEl.innerHTML = renderNavTabs(activeTabs);

  const sessionEl = document.getElementById("sessionBox");
  if (sessionEl) sessionEl.innerHTML = renderSessionBox();

  const mainScroll = document.getElementById("mainScroll");
  const scrollTop = mainScroll ? mainScroll.scrollTop : 0;

  const tabEl = document.getElementById("tabContent");
  if (tabEl) tabEl.innerHTML = renderTab();

  if (mainScroll) mainScroll.scrollTop = scrollTop;
  if (EDIT_BADGE_ID) {
    const input = document.getElementById(`badgeInput_${EDIT_BADGE_ID}`);
    if (input) { input.focus(); input.select(); }
  }
}

/* ------------------------------ 로그인 전 화면 ------------------------------ */

function authWrap(inner) {
  return `
  <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; position:relative; overflow:hidden; background:var(--bg);">
    <div style="position:absolute; inset:0; background:radial-gradient(circle at 50% 20%, rgba(168,112,48,0.12), transparent 60%);"></div>
    <div class="fade-up panel" style="width:100%; max-width:420px; padding:40px 36px; position:relative; z-index:1; border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
      <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:26px;">
        ${sealSvg(80)}
        <div class="disp" style="font-size:22px; font-weight:700; margin-top:14px; letter-spacing:-0.02em; color:var(--text);">경찰청 인트라넷</div>
        <div class="mono" style="font-size:11px; color:var(--muted); margin-top:4px; letter-spacing:0.06em;">ⓒ2026</div>
      </div>
      ${inner}
    </div>
  </div>`;
}

function renderGate() {
  return authWrap(`
    <div style="display:flex; flex-direction:column; gap:12px;">
      <button data-action="goto-create" class="btn-gold disp" style="padding:14px 0; font-size:15px; border-radius:var(--radius-sm);">새 팩션 만들기</button>
      <button data-action="goto-join" class="btn-ghost disp" style="padding:13px 0; font-size:15px; text-align:center; border-radius:var(--radius-sm);">팩션 코드로 가입 신청</button>
      <button data-action="goto-login" class="link-btn" style="margin-top:12px; text-align:center;">이미 계정이 있어요 · 로그인</button>
    </div>
  `);
}

function renderCreate() {
  return authWrap(`
    <form data-action="submit-create">
      <div class="mono" style="font-size:11.5px; font-weight:600; color:var(--muted); margin-bottom:16px;">새 팩션 만들기</div>
      <div class="field"><label>팩션 이름</label><input id="cfName" style="width:100%;" placeholder="예) 경찰청" /></div>
      <div class="field" style="margin-top:14px;"><label>설립자 이름</label><input id="cfFounderName" style="width:100%;" /></div>
      <div class="field" style="margin-top:14px;"><label>설립자 고유번호</label><input id="cfBadge" class="mono" style="width:100%;" placeholder="예) 0001" /></div>
      <div class="field" style="margin-top:14px;"><label>로그인 아이디</label><input id="cfUser" style="width:100%;" autocomplete="username" /></div>
      <div class="field" style="margin-top:14px;"><label>로그인 비밀번호 (6자 이상)</label><input id="cfPass" type="password" style="width:100%;" autocomplete="new-password" /></div>
      <div id="createErr" style="font-size:12.5px; color:var(--danger); margin-top:10px; display:none;"></div>
      <button type="submit" class="btn-gold disp" style="width:100%; padding:12px 0; font-size:15px; margin-top:20px;">팩션 생성</button>
      <button type="button" data-action="goto-gate" class="link-btn" style="display:block; margin:16px auto 0;">← 뒤로</button>
    </form>
  `);
}

function renderCreateDone() {
  return authWrap(`
    <div class="mono" style="font-size:11.5px; font-weight:600; color:var(--muted); margin-bottom:10px; text-align:center;">팩션이 생성되었습니다</div>
    <div style="text-align:center; font-size:16px; font-weight:700; margin-bottom:16px;">${LAST.factionName}</div>
    <div class="code-display">${LAST.code}</div>
    <div class="mono" style="font-size:11.5px; color:var(--muted); margin-top:14px; line-height:1.7; text-align:center;">
      이 코드를 팩션원들에게 공유하세요.<br/>가입 신청 시 이 코드를 입력해야 합니다.
    </div>
    <button data-action="goto-login" class="btn-gold disp" style="width:100%; padding:12px 0; font-size:15px; margin-top:20px;">로그인하러 가기</button>
  `);
}

function renderJoin() {
  return authWrap(`
    <form data-action="submit-join">
      <div class="mono" style="font-size:11.5px; font-weight:600; color:var(--muted); margin-bottom:16px;">팩션 코드로 가입 신청</div>
      <div class="field"><label>팩션 코드</label><input id="jfCode" class="mono" style="width:100%; letter-spacing:2px;" placeholder="예) A3F9K2" /></div>
      <div class="field" style="margin-top:14px;"><label>이름</label><input id="jfName" style="width:100%;" /></div>
      <div class="field" style="margin-top:14px;"><label>고유번호</label><input id="jfUid" class="mono" style="width:100%;" placeholder="예) 14" /></div>
      <div class="field" style="margin-top:14px;"><label>로그인 아이디</label><input id="jfUser" style="width:100%;" autocomplete="username" /></div>
      <div class="field" style="margin-top:14px;"><label>로그인 비밀번호 (6자 이상)</label><input id="jfPass" type="password" style="width:100%;" autocomplete="new-password" /></div>
      <div id="joinErr" style="font-size:12.5px; color:var(--danger); margin-top:10px; display:none;"></div>
      <button type="submit" class="btn-gold disp" style="width:100%; padding:12px 0; font-size:15px; margin-top:20px;">가입하기</button>
      <button type="button" data-action="goto-gate" class="link-btn" style="display:block; margin:16px auto 0;">← 뒤로</button>
    </form>
  `);
}

function renderJoinSent() {
  return authWrap(`
    <div style="text-align:center;">
      <div class="badge ok" style="margin:0 auto 16px; font-size:13px; padding:6px 16px;">요청됨</div>
      <div style="font-size:15px; line-height:1.7; font-weight:500;">가입 요청이 접수되었습니다.<br/>팩션 담당자의 승인을 기다려주세요.</div>
      <button data-action="goto-gate" class="btn-ghost disp" style="margin-top:22px; padding:10px 20px;">확인</button>
    </div>
  `);
}

function renderLogin() {
  return authWrap(`
    <form data-action="submit-login">
      <div class="field"><label>아이디</label><input id="loginUser" style="width:100%;" placeholder="username" autocomplete="username" /></div>
      <div class="field" style="margin-top:14px;"><label>비밀번호</label><input id="loginPass" type="password" style="width:100%;" placeholder="••••••••" autocomplete="current-password" /></div>
      <div id="loginErr" style="font-size:12.5px; color:var(--danger); margin-top:10px; display:none;"></div>
      <button type="submit" class="btn-gold disp" style="width:100%; padding:12px 0; font-size:15px; margin-top:20px;">접속 승인 요청</button>
      <button type="button" data-action="goto-gate" class="link-btn" style="display:block; margin:16px auto 0;">← 뒤로</button>
    </form>
  `);
}

/* ------------------------------ 로그인 후 셸/탭 ------------------------------ */

function renderNavTabs(tabs) {
  return tabs.map(t => `<button class="tab-btn ${TAB === t.key ? 'active' : ''}" data-action="switch-tab" data-tab="${t.key}">${t.label}</button>`).join("");
}

function renderSessionBox() {
  const isWorking = DATA.attendance && DATA.attendance.find(a => a.user_id === SESSION.id && !a.clock_out_time);
  const workBtnHtml = isWorking
    ? `<button data-action="toggle-work" class="btn-ghost danger" style="margin-top:10px; width:100%; padding:9px 0; font-size:12.5px; font-weight:600;">퇴근하기 (근무 중)</button>`
    : `<button data-action="toggle-work" class="btn-ghost ok" style="margin-top:10px; width:100%; padding:9px 0; font-size:12.5px; font-weight:600;">출근하기</button>`;
  return `
    <div style="font-size:13.5px; font-weight:700;">${SESSION.name}</div>
    <div class="mono" style="font-size:11px; color:var(--gold); font-weight:600; margin-top:2px;">${SESSION.rank} · No.${formatBadge(SESSION.badge)}</div>
    ${workBtnHtml}
    <button data-action="logout" class="btn-ghost" style="margin-top:8px; width:100%; padding:8px 0; font-size:12px; border-color:var(--line); color:var(--muted);">로그아웃</button>`;
}

function renderShell(tabs) {
  return `
  <div style="height:100vh; display:flex; position:relative; background:var(--bg); overflow:hidden;">
    <aside class="panel" style="width:230px; margin:16px 0 16px 16px; border-radius:var(--radius-lg); display:flex; flex-direction:column; flex-shrink:0; min-height:0;">
      <div style="padding:22px 20px; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--line); flex-shrink:0;">
        ${sealSvg(42)}
        <div>
          <div class="disp" style="font-size:15px; font-weight:700; color:var(--text);">${DATA.name}</div>
          <div class="mono" style="font-size:10px; color:var(--muted); font-weight:600;">INTRANET SYS</div>
        </div>
      </div>
      <nav id="navTabs" style="padding:14px; display:flex; flex-direction:column; gap:4px; flex:1; overflow-y:auto; min-height:0;">
        ${renderNavTabs(tabs)}
      </nav>
      <div id="sessionBox" style="padding:16px; border-top:1px solid var(--line); background:var(--panel2); border-radius:0 0 var(--radius-lg) var(--radius-lg); flex-shrink:0;">
        ${renderSessionBox()}
      </div>
    </aside>
    <main id="mainScroll" style="flex:1; padding:24px 28px; overflow-y:auto; position:relative; z-index:1; min-height:0;">
      <div class="fade-up" id="tabContent">${renderTab()}</div>
    </main>
  </div>`;
}

function renderTab() {
  if (TAB === "dash") return renderDash();
  if (TAB === "rpreport") return renderRpReport();
  if (TAB === "lawcalc") return renderLawCalc();
  if (TAB === "members") return renderMembers();
  if (TAB === "attendance") return renderAttendance();
  if (TAB === "notices") return renderNotices();
  if (TAB === "apps") return renderApps();
  if (TAB === "warn") return renderWarn();
  if (TAB === "accounts") return renderAccounts();
  if (TAB === "settings") return renderSettings();
  return "";
}

function header(title, subtitle, actionHtml) {
  return `<div style="display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:22px;">
    <div>
      <div class="disp" style="font-size:26px; font-weight:700; color:var(--text); letter-spacing:-0.02em;">${title}</div>
      ${subtitle ? `<div style="font-size:13.5px; color:var(--muted); margin-top:4px;">${subtitle}</div>` : ""}
    </div>
    ${actionHtml ? `<div style="display:flex; gap:8px;">${actionHtml}</div>` : ""}
  </div>`;
}

function statCard(label, value, color) {
  return `<div class="panel" style="padding:18px 20px; flex:1; min-width:150px;">
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <span class="mono" style="font-size:11px; font-weight:600; color:var(--muted); letter-spacing:.04em;">${label}</span>
      <span style="color:${color || 'var(--gold)'}; font-size:12px;">●</span>
    </div>
    <div class="disp" style="font-size:32px; font-weight:700; margin-top:8px; color:var(--text);">${value}</div>
  </div>`;
}

function renderDash() {
  const activeCount = DATA.accounts.filter(a => a.status === "재직").length;
  const pendingApps = (DATA.applications || []).filter(a => a.status === "요청됨").length;
  const warnCount = (DATA.warnings || []).length;
  const recent = [...(DATA.warnings || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
  return `
    ${header("대시보드", `${SESSION.rank} ${SESSION.name} 님, 오늘도 수고 많으십니다.`)}
    <div class="panel" style="display:flex; align-items:center; justify-content:space-between; padding:14px 20px; margin-bottom:18px;">
      <span style="font-size:13px; color:var(--muted); font-weight:500;">팩션 코드 (신규 가입 시 공유)</span>
      <span class="mono" style="font-size:15px; font-weight:700; color:var(--gold); letter-spacing:2px;">${DATA.code}</span>
    </div>
    <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:24px;">
      ${statCard("재직 팩션원", activeCount)}
      ${statCard("대기 중 가입신청", pendingApps, "var(--steel)")}
      ${statCard("누적 내부경고", warnCount, "var(--danger)")}
      ${statCard("등록 공지", (DATA.sideNotices || []).length, "var(--ok)")}
    </div>
    ${renderRankingPanelHtml("근무 총시간 순위 TOP 5", 5)}
    ${renderRpRankingPanelHtml("RP 보고서 작성 순위 TOP 5", 5)}
    <div class="panel">
      <div style="padding:14px 20px; border-bottom:1px solid var(--line); font-size:13px; color:var(--muted); font-weight:700;">최근 내부경고</div>
      ${recent.length === 0 ? `<div style="padding:30px; text-align:center; color:var(--muted); font-size:13.5px;">등록된 내부경고가 없습니다.</div>` :
      recent.map(w => `<div class="row-hover" style="padding:12px 20px; border-top:1px solid var(--line); display:flex; justify-content:space-between; font-size:13.5px;">
          <span><strong style="color:var(--text);">${w.target_name}</strong> <span style="color:var(--muted);">· ${w.reason}</span></span>
          <span class="mono" style="color:var(--muted); font-size:12px;">${w.date}</span>
        </div>`).join("")}
    </div>`;
}

function computeRpReportRanking() {
  const totals = {};
  (DATA.rpReports || []).forEach(r => {
    const key = r.user_id || `${r.name}_${r.badge}`;
    if (!totals[key]) totals[key] = { name: r.name, badge: r.badge, count: 0 };
    totals[key].count += 1;
  });
  return Object.values(totals).sort((a, b) => b.count - a.count);
}

function renderRpRankingPanelHtml(title, limit) {
  const ranking = computeRpReportRanking();
  const list = limit ? ranking.slice(0, limit) : ranking;

  let html = `<div class="panel" style="margin-bottom:18px;">
    <div style="padding:14px 20px; border-bottom:1px solid var(--line); font-size:13px; color:var(--muted); font-weight:700;">${title}</div>`;

  if (list.length === 0) {
    html += `<div style="padding:24px; text-align:center; color:var(--muted); font-size:13.5px;">등록된 RP 보고서가 없습니다.</div>`;
  } else {
    list.forEach((r, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : String(idx + 1);
      html += `<div class="row-hover" style="display:flex; justify-content:space-between; align-items:center; padding:10px 20px; border-top:1px solid var(--line);">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="mono" style="width:22px; text-align:center; font-weight:700; color:${idx < 3 ? "var(--gold)" : "var(--muted)"};">${medal}</span>
          <span style="font-weight:600;">${r.name}</span>
          <span class="mono" style="color:var(--muted); font-size:12px;">고유번호 ${formatBadge(r.badge)}</span>
        </div>
        <span class="mono" style="color:var(--gold); font-weight:700;">${r.count} 건</span>
      </div>`;
    });
  }
  html += `</div>`;
  return html;
}

// 임시: 근무 랭킹 렌더링 헬퍼
function renderRankingPanelHtml(title, limit) {
  return `<div class="panel" style="margin-bottom:18px;">
    <div style="padding:14px 20px; border-bottom:1px solid var(--line); font-size:13px; color:var(--muted); font-weight:700;">${title}</div>
    <div style="padding:24px; text-align:center; color:var(--muted); font-size:13.5px;">근태 데이터 집계 중...</div>
  </div>`;
}

function renderRpReportList() {
  const reports = DATA.rpReports || [];
  if (reports.length === 0) {
    return `<div style="padding:30px; text-align:center; color:var(--muted); font-size:13.5px;">등록된 RP 보고서가 없습니다.</div>`;
  }
  return reports.map(r => `
    <div class="row-hover" style="padding:14px 20px; border-top:1px solid var(--line);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-size:14px; font-weight:600;">${r.rank || ''} ${r.name} <span class="mono" style="color:var(--muted); font-size:12px; font-weight:400;">· No.${formatBadge(r.badge)}</span></div>
          <div class="mono" style="font-size:11.5px; color:var(--muted); margin-top:3px;">${formatDisplayDateTime(r.created_at)} · ${r.location || '-'} · 상대: ${r.target_faction || '-'} · 결과: ${r.result || '-'}</div>
        </div>
      </div>
      <div style="font-size:13px; color:var(--text); margin-top:8px; white-space:pre-wrap; line-height:1.5;">${r.content || ''}</div>
    </div>`).join("");
}

function renderRpReport() {
  return `
    ${header("RP 보고서 작성", "작성된 보고서는 연동된 디스코드 채널로 즉시 발송되며, 아래 목록과 작성 순위에도 기록됩니다.")}
    ${renderRpRankingPanelHtml("RP 보고서 작성 순위 TOP 5", 5)}
    <div class="panel" style="padding:24px; max-width:680px; margin-bottom:24px;">
      <form data-action="submit-rp-report">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
          <div class="field">
            <label>작성자 정보</label>
            <input value="${SESSION.rank} ${SESSION.name} (No.${formatBadge(SESSION.badge)})" disabled style="width:100%; opacity:0.7; background:var(--panel2);" />
          </div>
          <div class="field">
            <label>RP 참여 장소</label>
            <input id="rpLocation" style="width:100%;" placeholder="예) 서부 ATM / 북부 은행" required />
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
          <div class="field">
            <label>상대방 팩션</label>
            <input id="rpTargetFaction" style="width:100%;" placeholder="예)시민 / 조직" required />
          </div>
          <div class="field">
            <label>결과</label>
            <input id="rpResult" style="width:100%;" placeholder="예) 승리 / 패배" required />
          </div>
        </div>

        <div class="field" style="margin-bottom:20px;">
          <label>상세 내용</label>
          <textarea id="rpContent" style="width:100%; min-height:160px; font-family:monospace; line-height:1.5;" placeholder="RP 진행 내역 및 상세 상황을 적어주세요..." required></textarea>
        </div>

        <button type="submit" class="btn-gold disp" style="width:100%; padding:13px 0; font-size:15px;">디스코드로 RP 보고서 전송</button>
      </form>
    </div>
    <div style="font-size:13px; color:var(--muted); margin-bottom:10px; font-weight:700;">최근 RP 보고서 (총 ${(DATA.rpReports || []).length}건)</div>
    <div class="panel">${renderRpReportList()}</div>`;
}

function getLawKey(item) { return `${item.category}||${item.name}`; }

function parseFine(text) {
  if (!text || text.includes('/')) return null;
  const match = text.match(/[\d,]+(?=\s*원)/);
  return match ? parseInt(match[0].replace(/,/g, ''), 10) : null;
}

function parseDetention(text) {
  if (!text) return 0;
  const match = text.match(/(\d+)\s*분/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseMinDetention(etcText) {
  if (!etcText) return 0;
  const match = etcText.match(/구금\s*최소\s*(\d+)\s*분/);
  return match ? parseInt(match[1], 10) : 0;
}

const BAIL_RATE_PER_MIN = 5000000;

function formatWon(n) { return n.toLocaleString() + " 원"; }
function formatMinutes(n) {
  if (n <= 0) return "0분";
  const h = Math.floor(n / 60), m = n % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function renderLawCalc() {
  const categories = ["전체", "건물 알피", "차량 알피", "영장", "경범죄", "중범죄"];
  return `
    ${header("법률 검색 및 계산기", "죄목을 선택하면 벌금과 구금시간이 자동으로 합산됩니다.")}
    <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
      ${categories.map(c => `
        <button class="btn-ghost ${LAW_CAT === c ? 'active' : ''}" 
                data-action="law-cat" data-cat="${c}" 
                style="padding:8px 16px; font-size:13px; font-weight:600; ${LAW_CAT === c ? 'background:var(--gold); color:#000;' : ''}">
          ${c}
        </button>
      `).join("")}
    </div>
    <div class="panel" style="display:flex; align-items:center; gap:12px; padding:10px 16px; margin-bottom:16px;">
      <span style="color:var(--muted); font-size:15px;">🔍</span>
      <input id="lawSearchInput" data-action="law-search" value="${LAW_SEARCH}" placeholder="검색어 입력 (죄목, 키워드, 위치)" style="background:transparent; border:none; color:var(--text); width:100%; font-size:14px; outline:none;" />
      <button data-action="law-select-all" class="btn-gold" style="padding:6px 12px; font-size:12px; white-space:nowrap;">전체 선택</button>
      <button data-action="law-clear-all" class="btn-ghost" style="padding:6px 12px; font-size:12px; white-space:nowrap;">선택 해제</button>
    </div>
    <div id="lawResults">${renderLawResults()}</div>
  `;
}

function renderLawResults() {
  const query = LAW_SEARCH.trim().toLowerCase();
  const filtered = LAW_DATA.filter(item => {
    const matchCat = LAW_CAT === "전체" || item.category === LAW_CAT;
    const matchQuery = !query ||
      item.name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      (item.etc && item.etc.toLowerCase().includes(query));
    return matchCat && matchQuery;
  });

  let totalFine = 0, totalDetention = 0, count = 0, excluded = [];
  let totalMinDetention = 0;
  const minDetentionItems = [];
  LAW_DATA.forEach(item => {
    const key = getLawKey(item);
    if (LAW_SELECTED.has(key)) {
      count++;
      const fVal = parseFine(item.fine);
      if (fVal === null) excluded.push(item.name);
      else totalFine += fVal;
      totalDetention += parseDetention(item.detention);

      const minMins = parseMinDetention(item.etc);
      if (minMins > 0) {
        totalMinDetention += minMins;
        minDetentionItems.push(`${item.name}(${minMins}분)`);
      }
    }
  });

  const bailableMinutes = Math.max(0, totalDetention - totalMinDetention);
  const bailCost = bailableMinutes * BAIL_RATE_PER_MIN;

  const lastItem = LAW_LAST_CLICKED || (filtered.length > 0 ? filtered[0] : null);

  return `
    <div class="panel" style="margin-bottom:16px; max-height:420px; overflow-y:auto;">
      <div class="table-head" style="grid-template-columns: 50px 100px 1.5fr 1fr 1fr 2fr; position:sticky; top:0; background:var(--panel); z-index:2;">
        <span style="text-align:center;">선택</span>
        <span style="text-align:center;">구분</span>
        <span>죄목 / 위치</span>
        <span style="text-align:center;">벌금</span>
        <span style="text-align:center;">구금시간</span>
        <span>기타 사항</span>
      </div>
      ${filtered.length === 0 ? `<div style="padding:30px; text-align:center; color:var(--muted); font-size:13.5px;">검색 결과가 없습니다.</div>` :
      filtered.map(item => {
        const key = getLawKey(item);
        const checked = LAW_SELECTED.has(key);
        return `
        <div class="table-row row-hover ${checked ? 'selected' : ''}" 
             data-action="law-toggle" data-key="${key}"
             style="grid-template-columns: 50px 100px 1.5fr 1fr 1fr 2fr; cursor:pointer; ${checked ? 'background:rgba(168,112,48,0.18);' : ''}">
          <span style="text-align:center; font-weight:bold; color:${checked ? 'var(--gold)' : 'var(--muted)'};">${checked ? '✓' : '☐'}</span>
          <span style="text-align:center; font-size:12px; color:var(--muted);">${item.category}</span>
          <span style="font-weight:600;">${item.name}</span>
          <span class="mono" style="text-align:center; color:var(--gold);">${item.fine || '-'}</span>
          <span class="mono" style="text-align:center; color:var(--steel);">${item.detention || '-'}</span>
          <span style="font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.etc || '-'}</span>
        </div>`;
      }).join("")}
    </div>

    <div style="display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap;">
      <div class="panel" style="flex:1; min-width:200px; padding:16px 20px;">
        <div style="font-size:12px; color:var(--muted); font-weight:600;">선택된 항목</div>
        <div class="disp" style="font-size:24px; font-weight:700; color:var(--text); margin-top:4px;">${count} 건</div>
      </div>
      <div class="panel" style="flex:1.5; min-width:220px; padding:16px 20px;">
        <div style="font-size:12px; color:var(--muted); font-weight:600;">총 벌금</div>
        <div class="disp mono" style="font-size:24px; font-weight:700; color:var(--gold); margin-top:4px;">${count === 0 ? '-' : formatWon(totalFine)}</div>
      </div>
      <div class="panel" style="flex:1.5; min-width:220px; padding:16px 20px;">
        <div style="font-size:12px; color:var(--muted); font-weight:600;">총 구금시간</div>
        <div class="disp mono" style="font-size:24px; font-weight:700; color:var(--steel); margin-top:4px;">${count === 0 ? '-' : formatMinutes(totalDetention)}</div>
      </div>
      <div class="panel" style="flex:1.5; min-width:220px; padding:16px 20px;">
        <div style="font-size:12px; color:var(--muted); font-weight:600;">보석금 (구금시간 전액 단축 시)</div>
        <div class="disp mono" style="font-size:24px; font-weight:700; color:#3ddc84; margin-top:4px;">${count === 0 ? '-' : formatWon(bailCost)}</div>
        ${totalMinDetention > 0 ? `<div style="font-size:11px; color:var(--muted); margin-top:4px;">※ 최소 구금 ${formatMinutes(totalMinDetention)}은 단축 불가 (${minDetentionItems.join(", ")})</div>` : ''}
      </div>
      <div class="panel" style="flex:1.5; min-width:220px; padding:16px 20px; border:1px solid var(--gold);">
        <div style="font-size:12px; color:var(--muted); font-weight:600;">총 납부액 (벌금 + 보석금)</div>
        <div class="disp mono" style="font-size:24px; font-weight:700; color:var(--gold); margin-top:4px;">${count === 0 ? '-' : formatWon(totalFine + bailCost)}</div>
      </div>
    </div>
    ${excluded.length > 0 ? `<div style="font-size:12px; color:var(--danger); margin-bottom:16px; font-weight:600;">⚠ 수동 계산 필요 항목 포함: ${excluded.join(", ")}</div>` : ''}
    ${lastItem ? `
    <div class="panel" style="padding:18px 20px; line-height:1.6; font-size:13.5px;">
      <div style="font-weight:700; color:var(--gold); margin-bottom:6px;">📌 ${lastItem.name} (${lastItem.category}) 진행 절차</div>
      <div style="color:var(--text); margin-bottom:10px;">${lastItem.process || "별도 진행 절차 없음"}</div>
      <div style="font-weight:700; color:var(--danger); margin-bottom:4px;">⚠️ 기타 주의사항</div>
      <div style="color:var(--muted);">${lastItem.etc || "없음"}</div>
    </div>` : ''}
  `;
}

function refreshLawResults() {
  const el = document.getElementById("lawResults");
  if (!el) return;
  const listPanel = el.querySelector(".panel");
  const prevScrollTop = listPanel ? listPanel.scrollTop : 0;
  el.innerHTML = renderLawResults();
  const newListPanel = el.querySelector(".panel");
  if (newListPanel) newListPanel.scrollTop = prevScrollTop;
}

function renderMembers() {
  return `
    ${header("팩션원 관리", `총 ${DATA.accounts.length}명 등록됨`,
    `<button data-action="export-members" class="btn-ghost">⭳ 엑셀 추출</button>
       <button data-action="toggle-add-member" class="btn-gold">+ 팩션원 등록</button>`)}
    <div id="addMemberForm" class="panel" style="display:none; padding:18px; margin-bottom:18px; gap:12px; align-items:flex-end; flex-wrap:wrap; flex-direction:row;">
      <div class="field"><label>이름</label><input id="mName" /></div>
      <div class="field"><label>고유번호</label><input id="mBadge" class="mono" style="width:110px;" placeholder="14" /></div>
      <div class="field"><label>계급</label><select id="mRank" style="border-radius:var(--radius-sm);">${RANKS.map(r => `<option value="${r}" ${r === "2등급" ? "selected" : ""}>${r}</option>`).join("")}</select></div>
      <button data-action="submit-member" class="btn-gold">등록</button>
    </div>
    <div class="panel" style="display:flex; align-items:center; gap:8px; margin-bottom:14px; padding:6px 14px; max-width:280px;">
      <span style="color:var(--muted);">⌕</span>
      <input id="memberSearch" data-action="search-members" placeholder="이름 또는 고유번호 검색" style="background:transparent; border:none; padding:6px 0; width:100%; box-shadow:none;" />
    </div>
    <div class="panel" id="memberList">${renderMemberRows(DATA.accounts)}</div>`;
}

let EDIT_BADGE_ID = null;

function getFilteredMembers() {
  const searchEl = document.getElementById("memberSearch");
  const q = searchEl ? searchEl.value.trim() : "";
  if (!q) return DATA.accounts;
  return DATA.accounts.filter(a => a.name.includes(q) || String(a.badge || "").includes(q));
}

function refreshMemberList() {
  const listEl = document.getElementById("memberList");
  if (!listEl) return;
  listEl.innerHTML = renderMemberRows(getFilteredMembers());
  if (EDIT_BADGE_ID) {
    const input = document.getElementById(`badgeInput_${EDIT_BADGE_ID}`);
    if (input) { input.focus(); input.select(); }
  }
}

function renderMemberRows(list) {
  const cols = "1.8fr 0.7fr 0.8fr 0.8fr 1fr 0.8fr";
  let html = `<div class="table-head" style="grid-template-columns:${cols};"><span>이름</span><span>고유번호</span><span>계급/분류</span><span>상태</span><span>가입일</span><span></span></div>`;
  if (list.length === 0) {
    html += `<div style="padding:28px; text-align:center; color:var(--muted); font-size:13.5px;">검색된 팩션원이 없습니다.</div>`;
    return html;
  }
  
  list.forEach(a => {
    const isEdit = EDIT_BADGE_ID === String(a.id);
    const badgeHtml = isEdit
      ? `<input id="badgeInput_${a.id}" value="${formatBadge(a.badge)}" style="width:60px; padding:4px 8px; font-size:12px;" />
         <button data-action="save-badge" data-id="${a.id}" class="btn-ghost" style="padding:4px 8px; font-size:11px;">저장</button>`
      : `<span class="mono" style="font-weight:600; cursor:pointer;" data-action="edit-badge" data-id="${a.id}">${formatBadge(a.badge)}</span>`;

    html += `
      <div class="table-row row-hover" style="grid-template-columns:${cols};">
        <span style="font-weight:600; color:var(--text);">${a.name}</span>
        <div style="display:flex; align-items:center; gap:6px;">${badgeHtml}</div>
        <div>
          <select data-action="change-rank" data-id="${a.id}" style="padding:4px 8px; font-size:12px; border-radius:var(--radius-sm); border:1px solid var(--line); background:var(--panel2); color:var(--text);">
            ${RANKS.map(r => `<option value="${r}" ${a.rank === r ? 'selected' : ''}>${r}</option>`).join("")}
          </select>
          <div class="mono" style="font-size:10px; color:var(--muted); margin-top:4px;">${getRankCategory(a.rank)}</div>
        </div>
        <span><span class="badge ${a.status === '재직' ? 'ok' : ''}">${a.status}</span></span>
        <span class="mono" style="font-size:12px; color:var(--muted);">${a.joined_at ? a.joined_at.split("T")[0] : '-'}</span>
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          <button data-action="toggle-status" data-id="${a.id}" class="btn-ghost" style="padding:6px 10px; font-size:11.5px;">${a.status === '재직' ? '해임' : '복직'}</button>
        </div>
      </div>`;
  });
  return html;
}

function renderAttendance() { return `<div style="padding:40px; text-align:center; color:var(--muted);">근태 관리 기능은 구현 예정입니다.</div>`; }
function renderNotices() { return `<div style="padding:40px; text-align:center; color:var(--muted);">사이드 공지 기능은 구현 예정입니다.</div>`; }
function renderApps() { return `<div style="padding:40px; text-align:center; color:var(--muted);">가입 신청 기능은 구현 예정입니다.</div>`; }
function renderWarn() { return `<div style="padding:40px; text-align:center; color:var(--muted);">내부경고 기능은 구현 예정입니다.</div>`; }
function renderAccounts() { return `<div style="padding:40px; text-align:center; color:var(--muted);">계정/권한 관리 기능은 구현 예정입니다.</div>`; }
function renderSettings() { return `<div style="padding:40px; text-align:center; color:var(--muted);">설정 기능은 구현 예정입니다.</div>`; }

/* ------------------------------ 클릭 및 폼 이벤트 로직 (끊어진 부분 포함) ------------------------------ */

const CLICK_ACTIONS = {
  "goto-create": () => { VIEW = "create"; render(); },
  "goto-join": () => { VIEW = "join"; render(); },
  "goto-login": () => { VIEW = "login"; render(); },
  "goto-gate": () => { VIEW = "gate"; render(); },
  "switch-tab": (el) => { TAB = el.dataset.tab; refreshTab(); },
  "logout": () => logout(),
  
  "toggle-add-member": () => {
    const el = document.getElementById("addMemberForm");
    if(el) el.style.display = el.style.display === "none" ? "flex" : "none";
  },

  "submit-member": async () => {
    const name = document.getElementById("mName").value.trim();
    const badge = document.getElementById("mBadge").value.trim();
    const rank = document.getElementById("mRank").value;
    
    if (!name) return showToast("이름을 입력해주세요.", "danger");

    const tempId = Date.now().toString();
    const newAcc = { id: tempId, name, badge, rank, status: "재직", joined_at: new Date().toISOString() };
    DATA.accounts.unshift(newAcc);
    refreshTab();

    try {
      const res = await apiCall("/members", "POST", { name, badge, rank });
      // ------ [기존 끊어진 부분 이후 완성] ------
      const idx = DATA.accounts.findIndex(a => a.id === tempId);
      if (idx !== -1) {
        DATA.accounts[idx] = res.member || res.account || { ...DATA.accounts[idx], id: res.id || tempId };
      }
      showToast(`${name} 팩션원 등록이 완료되었습니다.`, "ok");
      refreshTab();
    } catch (e) {
      DATA.accounts = DATA.accounts.filter(a => a.id !== tempId);
      refreshTab();
    }
  },

  "edit-badge": (el) => { EDIT_BADGE_ID = el.dataset.id; refreshMemberList(); },
  "cancel-badge-edit": () => { EDIT_BADGE_ID = null; refreshMemberList(); },
  
  "save-badge": async (el) => {
    const id = el.dataset.id;
    const input = document.getElementById(`badgeInput_${id}`);
    if (!input) return;
    const newBadge = formatBadge(input.value.trim());
    const acc = DATA.accounts.find(a => String(a.id) === String(id));
    if (!acc || acc.badge === newBadge) { EDIT_BADGE_ID = null; refreshMemberList(); return; }
    
    const oldBadge = acc.badge;
    acc.badge = newBadge;
    EDIT_BADGE_ID = null;
    refreshMemberList();
    
    try { 
      await apiCall(`/members/${id}/badge`, "PUT", { badge: newBadge }); 
      showToast("고유번호가 변경되었습니다.", "ok"); 
    } catch (e) { 
      acc.badge = oldBadge; 
      refreshMemberList(); 
    }
  },
  
  "toggle-status": async (el) => {
    const id = el.dataset.id;
    const acc = DATA.accounts.find(a => String(a.id) === String(id));
    if(!acc) return;
    const oldStatus = acc.status;
    acc.status = oldStatus === "재직" ? "해임" : "재직";
    refreshMemberList();
    try { 
      await apiCall(`/members/${id}/status`, "PUT", { status: acc.status }); 
      showToast("상태가 변경되었습니다.", "ok");
    } catch (e) { 
      acc.status = oldStatus; 
      refreshMemberList(); 
    }
  },

  "law-cat": (el) => {
    LAW_CAT = el.dataset.cat;
    refreshLawResults();
  },
  
  "law-toggle": (el) => {
    const key = el.dataset.key;
    if (LAW_SELECTED.has(key)) LAW_SELECTED.delete(key);
    else { LAW_SELECTED.add(key); LAW_LAST_CLICKED = LAW_DATA.find(i => getLawKey(i) === key); }
    refreshLawResults();
  },

  "law-select-all": () => {
    LAW_SEARCH = document.getElementById("lawSearchInput").value.trim().toLowerCase();
    LAW_DATA.forEach(item => {
      if (LAW_CAT !== "전체" && item.category !== LAW_CAT) return;
      if (LAW_SEARCH && !(item.name.toLowerCase().includes(LAW_SEARCH) || item.category.toLowerCase().includes(LAW_SEARCH))) return;
      LAW_SELECTED.add(getLawKey(item));
    });
    refreshLawResults();
  },

  "law-clear-all": () => {
    LAW_SELECTED.clear();
    LAW_LAST_CLICKED = null;
    refreshLawResults();
  }
};

/* ------------------------------ 전역 이벤트 리스너 세팅 ------------------------------ */

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if(btn && CLICK_ACTIONS[btn.dataset.action]) {
    e.preventDefault();
    CLICK_ACTIONS[btn.dataset.action](btn);
  }
});

document.addEventListener("input", e => {
  if (e.target.dataset.action === "law-search") {
    LAW_SEARCH = e.target.value;
    refreshLawResults();
  }
  if (e.target.dataset.action === "search-members") {
    refreshMemberList();
  }
});

document.addEventListener("change", async e => {
  if (e.target.dataset.action === "change-rank") {
    const id = e.target.dataset.id;
    const newRank = e.target.value;
    const acc = DATA.accounts.find(a => String(a.id) === String(id));
    if(!acc) return;
    const oldRank = acc.rank;
    acc.rank = newRank;
    refreshMemberList();
    try { 
      await apiCall(`/members/${id}/rank`, "PUT", { rank: newRank }); 
      showToast("계급이 변경되었습니다.", "ok"); 
    } catch(err) { 
      acc.rank = oldRank; 
      refreshMemberList(); 
    }
  }
});

document.addEventListener("submit", async e => {
  e.preventDefault();
  const action = e.target.dataset.action;
  if (!action) return;

  if (action === "submit-login") {
    const user = document.getElementById("loginUser").value.trim();
    const pass = document.getElementById("loginPass").value.trim();
    const err = document.getElementById("loginErr");
    err.style.display="none";
    if(!user || !pass) { err.textContent="입력 정보를 확인하세요."; err.style.display="block"; return; }
    try {
      const res = await apiCall("/auth/login", "POST", { username: user, password: pass });
      TOKEN = res.token;
      SESSION = res.session;
      localStorage.setItem("bureau_token", TOKEN);
      localStorage.setItem("bureau_session", JSON.stringify(SESSION));
      await fetchFactionData();
      startPolling();
    } catch(errMsg) { 
      err.textContent = errMsg.message || "로그인 실패"; 
      err.style.display="block"; 
    }
  } 
  else if (action === "submit-create") {
    const name = document.getElementById("cfName").value.trim();
    const founder = document.getElementById("cfFounderName").value.trim();
    const badge = document.getElementById("cfBadge").value.trim();
    const user = document.getElementById("cfUser").value.trim();
    const pass = document.getElementById("cfPass").value.trim();
    const err = document.getElementById("createErr");
    err.style.display="none";
    try {
      const res = await apiCall("/auth/create", "POST", { name, founderName: founder, badge, username: user, password: pass });
      LAST = { factionName: name, code: res.code };
      VIEW = "createDone";
      render();
    } catch(errMsg) { 
      err.textContent = errMsg.message; 
      err.style.display="block"; 
    }
  }
  else if (action === "submit-join") {
    const code = document.getElementById("jfCode").value.trim();
    const name = document.getElementById("jfName").value.trim();
    const uid = document.getElementById("jfUid").value.trim();
    const user = document.getElementById("jfUser").value.trim();
    const pass = document.getElementById("jfPass").value.trim();
    const err = document.getElementById("joinErr");
    err.style.display="none";
    try {
      await apiCall("/auth/join", "POST", { code, name, uid, username: user, password: pass });
      VIEW = "joinSent";
      render();
    } catch(errMsg) { 
      err.textContent = errMsg.message; 
      err.style.display="block"; 
    }
  }
  else if (action === "submit-rp-report") {
    const loc = document.getElementById("rpLocation").value.trim();
    const target = document.getElementById("rpTargetFaction").value.trim();
    const result = document.getElementById("rpResult").value.trim();
    const content = document.getElementById("rpContent").value.trim();
    
    // Optimistic Update
    const newReport = { 
      name: SESSION.name, badge: SESSION.badge, rank: SESSION.rank, 
      location: loc, target_faction: target, result, content, created_at: new Date().toISOString() 
    };
    
    if(!DATA.rpReports) DATA.rpReports = [];
    DATA.rpReports.unshift(newReport);
    refreshTab();
    showToast("RP 보고서가 전송되었습니다.", "ok");

    try {
      const res = await apiCall("/rp-reports", "POST", { location: loc, target_faction: target, result, content });
      // replace with backend confirmed ID/data if needed
    } catch(errMsg) {
      // rollback
      DATA.rpReports.shift();
      refreshTab();
    }
  }
});

/* ------------------------------ 시스템 초기화 ------------------------------ */

async function init() {
  if(TOKEN) {
    try { 
      await fetchFactionData(); 
      startPolling(); 
    } catch(e) { 
      logout(); 
    }
  } else {
    render();
  }
}

// 앱 실행
init();
