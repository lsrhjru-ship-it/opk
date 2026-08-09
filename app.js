/* ============================================================================
   보안국 인트라넷 — 백엔드 API 연동 + 법률 계산기 + RP 보고서 통합 버전
   (계급별 등급 분류 및 권한 관리 시스템 적용)
   ============================================================================ */

const API_BASE = "https://lsrhjru.wisp.uno/api";

// 전체 계급 목록
const RANKS = ["위원장", "부위원장", "본부장", "총감", "차관보", "사령관", "참모장", "감찰관", "작전관", "지휘관", "특별보안관", "감독관", "수사관", "보안관", "교육생"];

let TOKEN = localStorage.getItem("bureau_token") || null;
let SESSION = JSON.parse(localStorage.getItem("bureau_session") || "null");
let DATA = null;
let TAB = "dash";
let VIEW = "gate";
let LAST = {};

/* ------------------------------ 계급 및 권한 유틸 ------------------------------ */

// 계급에 따른 등급 분류 헬퍼 함수
function getRankCategory(rank) {
  if (["위원장", "부위원장"].includes(rank)) return "임원직 간부";
  if (["본부장", "총감", "차관보", "사령관"].includes(rank)) return "고위직 간부";
  if (["참모장", "감찰관", "작전관", "지휘관"].includes(rank)) return "일반 간부직";
  return "일반직";
}

// 특정 기능 권한 보유 여부 확인 함수
// permKey: 'members' | 'attendance' | 'notices' | 'apps' | 'warn'
function hasPermission(permKey) {
  if (!SESSION) return false;
  // 팩션장(isOwner)이거나 위원장인 경우 모든 권한 허용
  if (SESSION.isOwner || SESSION.rank === "위원장") return true;

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
  if (SESSION && (SESSION.isOwner || SESSION.rank === "위원장")) {
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
  { category: "건물 알피", name: "북부은행", fine: "150,000,000원", detention: "25분", process: "공표 허가 -> 벨 울림 -> 사이드공지 2회 -> 무력진압 3회", etc: "구금 최소 10분" },
  { category: "건물 알피", name: "닭공장 털이", fine: "200,000,000원", detention: "20분", process: "공표 허가 -> 벨 울림 -> 사이드공지 2회 -> 무력진압 3회", etc: "무기 압수 필수 / 구금 최소 10분 / 금지자리 필수 확인" },
  { category: "건물 알피", name: "중부 보안국 털이", fine: "200,000,000원", detention: "40분", process: "공표 허가 -> 벨 울림 -> 사이드공지 2회 -> 무력진압 3회", etc: "인원 +2 / 구금 최소 10분" },
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
    DATA = res.faction;

    // 본인 계정의 최신 계급/권한을 세션에 동기화 (관리자가 권한을 새로 부여해도
    // 로그아웃 없이 즉시 반영되도록 하기 위함 — 그렇지 않으면 로그인 시점의
    // 오래된 SESSION.permissions 값이 계속 사용되어 새로 받은 권한 탭이 안 보임)
    if (SESSION) {
      const me = DATA.accounts.find(a => String(a.id) === String(SESSION.id));
      if (me) {
        SESSION.rank = me.rank;
        SESSION.permissions = me.permissions || [];
        SESSION.isOwner = !!me.isOwner;
        localStorage.setItem("bureau_session", JSON.stringify(SESSION));
      } else {
        // 본인 계정이 삭제된 경우
        return logout();
      }
    }

    render();
  } catch (e) {
    logout();
  }
}

function showToast(msg, kind) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = (kind === "danger" ? "⚠ " : "✓ ") + msg;
  el.className = kind === "danger" ? "danger" : "";
  el.style.display = "flex";
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => { el.style.display = "none"; }, 2600);
}

function genFactionCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function sealSvg(size) {
  return `<img src="https://cdn.discordapp.com/attachments/1532756181557313706/1532757610464411719/3c9c4182b3e7bae0.png?ex=6a77e683&is=6a769503&hm=7dfc4b4e888cda0fde247badee027883426957dc6dd57700c1cbcdc28b96dacb" alt="보안국 로고" class="bureau-logo-img" style="width:${size}px; height:${size}px;" />`;
}

function logout() {
  TOKEN = null;
  SESSION = null;
  DATA = null;
  localStorage.removeItem("bureau_token");
  localStorage.removeItem("bureau_session");
  VIEW = "gate";
  render();
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

  app.innerHTML = renderShell(activeTabs);
}

function refreshTab() {
  document.getElementById("tabContent").innerHTML = renderTab();
}

/* ------------------------------ 로그인 전 화면 ------------------------------ */

function authWrap(inner) {
  return `
  <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; position:relative; overflow:hidden; background:var(--bg);">
    <div style="position:absolute; inset:0; background:radial-gradient(circle at 50% 20%, rgba(168,112,48,0.12), transparent 60%);"></div>
    <div class="fade-up panel" style="width:100%; max-width:420px; padding:40px 36px; position:relative; z-index:1; border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
      <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:26px;">
        ${sealSvg(80)}
        <div class="disp" style="font-size:22px; font-weight:700; margin-top:14px; letter-spacing:-0.02em; color:var(--text);">보안국 인트라넷</div>
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
      <div class="field"><label>팩션 이름</label><input id="cfName" style="width:100%;" placeholder="예) 보안국" /></div>
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

function renderShell(tabs) {
  const isWorking = DATA.attendance.find(a => a.user_id === SESSION.id && !a.clock_out_time);
  const workBtnHtml = isWorking
    ? `<button data-action="toggle-work" class="btn-ghost danger" style="margin-top:10px; width:100%; padding:9px 0; font-size:12.5px; font-weight:600;">퇴근하기 (근무 중)</button>`
    : `<button data-action="toggle-work" class="btn-ghost ok" style="margin-top:10px; width:100%; padding:9px 0; font-size:12.5px; font-weight:600;">출근하기</button>`;

  // height:100vh(고정) + overflow:hidden 으로 바깥 컨테이너 높이를 화면에 고정한다.
  // (기존에는 min-height:100vh 였는데, 탭 내용이 길어지면(예: 사이드 공지 목록)
  //  컨테이너 자체가 내용 높이만큼 늘어나고, aside가 align-items:stretch로
  //  그 늘어난 높이에 맞춰 같이 늘어나면서 하단의 이름/출근하기/로그아웃 패널이
  //  화면 밖으로 밀려나는 버그가 있었다. main에만 overflow-y:auto + min-height:0을
  //  줘서 내용이 길 때 가운데 영역만 스크롤되고 사이드바는 항상 고정 높이를 유지하도록 수정.)
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
      <nav style="padding:14px; display:flex; flex-direction:column; gap:4px; flex:1; overflow-y:auto; min-height:0;">
        ${tabs.map(t => `<button class="tab-btn ${TAB === t.key ? 'active' : ''}" data-action="switch-tab" data-tab="${t.key}">${t.label}</button>`).join("")}
      </nav>
      <div style="padding:16px; border-top:1px solid var(--line); background:var(--panel2); border-radius:0 0 var(--radius-lg) var(--radius-lg); flex-shrink:0;">
        <div style="font-size:13.5px; font-weight:700;">${SESSION.name}</div>
        <div class="mono" style="font-size:11px; color:var(--gold); font-weight:600; margin-top:2px;">${SESSION.rank} · No.${formatBadge(SESSION.badge)}</div>
        ${workBtnHtml}
        <button data-action="logout" class="btn-ghost" style="margin-top:8px; width:100%; padding:8px 0; font-size:12px; border-color:var(--line); color:var(--muted);">로그아웃</button>
      </div>
    </aside>
    <main style="flex:1; padding:24px 28px; overflow-y:auto; position:relative; z-index:1; min-height:0;">
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

/* ------------------------------ 대시보드 ------------------------------ */

function renderDash() {
  const activeCount = DATA.accounts.filter(a => a.status === "재직").length;
  const pendingApps = DATA.applications.filter(a => a.status === "요청됨").length;
  const warnCount = DATA.warnings.length;
  const recent = [...DATA.warnings].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
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
      ${statCard("등록 공지", DATA.sideNotices.length, "var(--ok)")}
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

/* ------------------------------ RP 보고서 탭 ------------------------------ */

// 팩션원별 RP 보고서 작성 건수 집계 (많이 작성한 순)
function computeRpReportRanking() {
  const totals = {};
  (DATA.rpReports || []).forEach(r => {
    const key = r.user_id || `${r.name}_${r.badge}`;
    if (!totals[key]) totals[key] = { name: r.name, badge: r.badge, count: 0 };
    totals[key].count += 1;
  });
  return Object.values(totals).sort((a, b) => b.count - a.count);
}

// RP 보고서 작성 순위 패널 HTML (건수 기준)
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

/* ------------------------------ 법률 계산기 탭 ------------------------------ */

function getLawKey(item) {
  return `${item.category}||${item.name}`;
}

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

// "기타 사항"란에 "구금 최소 N분" 형태로 적힌 최소 구금 시간을 추출.
// 이 시간은 보석금을 내도 줄일 수 없는 시간이므로 보석금 계산에서 제외한다.
function parseMinDetention(etcText) {
  if (!etcText) return 0;
  const match = etcText.match(/구금\s*최소\s*(\d+)\s*분/);
  return match ? parseInt(match[1], 10) : 0;
}

// 보석금 단가: 1분 단축당 5,000,000원
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

// 검색/카테고리/선택 상태가 바뀔 때마다 이 부분만 갱신한다.
// (검색창 자체를 갈아끼우지 않아야 입력 중 포커스/커서 위치가 유지되어
//  "타이핑이 계속 끊기는" 문제가 발생하지 않는다.)
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
  let totalMinDetention = 0; // 보석금으로도 줄일 수 없는 최소 구금시간 합계
  const minDetentionItems = []; // 최소 구금이 있는 선택 항목들 (표시용)
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

  // 보석금으로 실제 단축 가능한 시간 = 총 구금시간 - 최소 구금시간(단축 불가)
  const bailableMinutes = Math.max(0, totalDetention - totalMinDetention);
  const bailCost = bailableMinutes * BAIL_RATE_PER_MIN;

  const lastItem = LAW_LAST_CLICKED || (filtered.length > 0 ? filtered[0] : null);

  return `
    <div class="panel" style="margin-bottom:16px; max-height:420px; overflow-y:auto;">
      <div class="table-head" style="grid-template-columns: 50px 100px 1.5fr 1fr 1fr 2fr; sticky; top:0; background:var(--panel); z-index:2;">
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

// 검색 입력창을 건드리지 않고 결과 영역만 갱신 + 포커스/커서 위치 보존
// + 항목 목록(.panel, overflow-y:auto) 자체가 통째로 다시 그려지면서
//   스크롤이 맨 위로 리셋되는 문제를 막기 위해 스크롤 위치도 함께 보존한다.
function refreshLawResults() {
  const el = document.getElementById("lawResults");
  if (!el) return;

  const listPanel = el.querySelector(".panel");
  const prevScrollTop = listPanel ? listPanel.scrollTop : 0;

  el.innerHTML = renderLawResults();

  const newListPanel = el.querySelector(".panel");
  if (newListPanel) newListPanel.scrollTop = prevScrollTop;
}

/* ------------------------------ 팩션원 및 근태 관리 ------------------------------ */

function renderMembers() {
  return `
    ${header("팩션원 관리", `총 ${DATA.accounts.length}명 등록됨`,
    `<button data-action="export-members" class="btn-ghost">⭳ 엑셀 추출</button>
       <button data-action="toggle-add-member" class="btn-gold">+ 팩션원 등록</button>`)}
    <div id="addMemberForm" class="panel" style="display:none; padding:18px; margin-bottom:18px; gap:12px; align-items:flex-end; flex-wrap:wrap; flex-direction:row;">
      <div class="field"><label>이름</label><input id="mName" /></div>
      <div class="field"><label>고유번호</label><input id="mBadge" class="mono" style="width:110px;" placeholder="14" /></div>
      <div class="field"><label>계급</label><select id="mRank">${RANKS.map(r => `<option value="${r}" ${r === "교육생" ? "selected" : ""}>${r}</option>`).join("")}</select></div>
      <button data-action="submit-member" class="btn-gold">등록</button>
    </div>
    <div class="panel" style="display:flex; align-items:center; gap:8px; margin-bottom:14px; padding:6px 14px; max-width:280px;">
      <span style="color:var(--muted);">⌕</span>
      <input id="memberSearch" data-action="search-members" placeholder="이름 또는 고유번호 검색" style="background:transparent; border:none; padding:6px 0; width:100%; box-shadow:none;" />
    </div>
    <div class="panel" id="memberList">${renderMemberRows(DATA.accounts)}</div>`;
}

function renderMemberRows(list) {
  const cols = "1.8fr 0.7fr 0.8fr 0.8fr 1fr 0.8fr";
  let html = `<div class="table-head" style="grid-template-columns:${cols};"><span>이름</span><span>고유번호</span><span>계급/분류</span><span>상태</span><span>가입일</span><span></span></div>`;
  if (list.length === 0) { html += `<div style="padding:28px; text-align:center; color:var(--muted); font-size:13.5px;">검색 결과가 없습니다.</div>`; return html; }

  list.forEach(a => {
    // 계급에 따른 등급 분류 추출
    const category = getRankCategory(a.rank);
    let catBadgeColor = "var(--muted)";
    if (category === "임원직 간부") catBadgeColor = "var(--gold)";
    else if (category === "고위직 간부") catBadgeColor = "#e74c3c";
    else if (category === "일반 간부직") catBadgeColor = "#3498db";

    html += `<div class="table-row row-hover" style="grid-template-columns:${cols}; align-items:center;" data-id="${a.id}">
      <span style="display:flex; align-items:center; gap:6px; font-weight:600;">
        ${a.name}
        <span style="font-size:10px; font-weight:700; color:${catBadgeColor}; border:1px solid ${catBadgeColor}; border-radius:4px; padding:1px 5px; line-height:1.5; white-space:nowrap;">${category}</span>
      </span>
      <span class="mono" style="color:var(--gold); font-weight:600;">${formatBadge(a.badge)}</span>
      <div style="display:flex; flex-direction:column; gap:4px;">
        <select data-action="change-rank" data-id="${a.id}" style="padding:4px 6px; font-size:12px; width:100%;">
          ${RANKS.map(r => `<option value="${r}" ${r === a.rank ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </div>
      <span class="badge ${a.status === "재직" ? "ok" : "danger"}">${a.status}</span>
      <span class="mono" style="color:var(--muted); font-size:12px;">${a.join_date || a.joinDate || "-"}</span>
      <button class="btn-ghost" data-action="toggle-status" data-id="${a.id}" style="padding:5px 12px; font-size:12px; justify-self:start;">${a.status === "재직" ? "해임 처리" : "복직 처리"}</button>
    </div>`;
  });
  return html;
}

/* ------------------------------ 근태 총시간 순위 계산 유틸 ------------------------------ */

// 시간 문자열을 Date로 파싱
// 서버는 이제 ISO 8601(new Date().toISOString())로 저장하지만, 과거에 저장된
// "2026. 8. 8. 오후 3:45:00" 형식(toLocaleString('ko-KR')) 레코드도 함께 지원한다.
function parseKoreanDateTime(str) {
  if (!str) return null;

  // 1) ISO 8601 등 표준 형식 우선 시도 (서버가 현재 저장하는 형식)
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  // 2) 과거 한국어 로케일 형식 fallback
  const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, ampm, hRaw, mi, s] = m;
  let h = parseInt(hRaw, 10);
  if (ampm === "오후" && h !== 12) h += 12;
  if (ampm === "오전" && h === 12) h = 0;
  return new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), h, parseInt(mi, 10), parseInt(s, 10));
}

// 화면에 사람이 읽기 좋은 한국어 형식으로 표시 (브라우저는 항상 풀 ICU를 갖고 있어 안전)
function formatDisplayDateTime(str) {
  const d = parseKoreanDateTime(str);
  return d ? d.toLocaleString('ko-KR') : (str || "-");
}

function formatWorkMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}시간 ${m}분`;
}

// 팩션원별 누적 근무시간 계산 (퇴근하지 않은 근무는 현재 시각까지 실시간 반영)
function computeAttendanceRanking() {
  const totals = {};
  DATA.attendance.forEach(log => {
    const inDate = parseKoreanDateTime(log.clock_in_time);
    if (!inDate) return;
    const outDate = log.clock_out_time ? parseKoreanDateTime(log.clock_out_time) : new Date();
    if (!outDate) return;

    const minutes = Math.max(0, Math.round((outDate - inDate) / 60000));
    const key = log.user_id || `${log.name}_${log.badge}`;
    if (!totals[key]) totals[key] = { name: log.name, badge: log.badge, minutes: 0 };
    totals[key].minutes += minutes;
  });
  return Object.values(totals).sort((a, b) => b.minutes - a.minutes);
}

// 근무 총시간 순위 패널 HTML (대시보드/근태 관리 탭에서 공용으로 사용)
function renderRankingPanelHtml(title, limit) {
  const ranking = computeAttendanceRanking();
  const list = limit ? ranking.slice(0, limit) : ranking;

  let html = `<div class="panel" style="margin-bottom:18px;">
    <div style="padding:14px 20px; border-bottom:1px solid var(--line); font-size:13px; color:var(--muted); font-weight:700;">${title}</div>`;

  if (list.length === 0) {
    html += `<div style="padding:24px; text-align:center; color:var(--muted); font-size:13.5px;">근무 기록이 없습니다.</div>`;
  } else {
    list.forEach((r, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : String(idx + 1);
      html += `<div class="row-hover" style="display:flex; justify-content:space-between; align-items:center; padding:10px 20px; border-top:1px solid var(--line);">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="mono" style="width:22px; text-align:center; font-weight:700; color:${idx < 3 ? "var(--gold)" : "var(--muted)"};">${medal}</span>
          <span style="font-weight:600;">${r.name}</span>
          <span class="mono" style="color:var(--muted); font-size:12px;">고유번호 ${formatBadge(r.badge)}</span>
        </div>
        <span class="mono" style="color:var(--gold); font-weight:700;">${formatWorkMinutes(r.minutes)}</span>
      </div>`;
    });
  }
  html += `</div>`;
  return html;
}

function renderAttendance() {
  const logs = [...DATA.attendance].reverse();
  const cols = "1.2fr 1fr 0.8fr 1.5fr 1.5fr 0.8fr";

  let html = `
    ${header("근태 관리", "인원들의 출퇴근 기록 및 계급을 확인합니다.")}
    ${renderRankingPanelHtml("근무 총시간 순위 (근무 중인 경우 현재 시각까지 반영)")}`;

  html += `
    <div class="panel">
      <div class="table-head" style="grid-template-columns:${cols};">
        <span>이름</span><span>계급</span><span>고유번호</span><span>출근 시간</span><span>퇴근 시간</span><span>상태</span>
      </div>`;

  if (logs.length === 0) {
    html += `<div style="padding:28px; text-align:center; color:var(--muted); font-size:13.5px;">출퇴근 기록이 없습니다.</div>`;
  } else {
    logs.forEach(log => {
      const userAcc = DATA.accounts.find(u => u.id === log.user_id);
      const userRank = userAcc ? userAcc.rank : (log.user_id === SESSION.id ? SESSION.rank : "님");
      const isWorking = !log.clock_out_time;

      html += `<div class="table-row row-hover" style="grid-template-columns:${cols};">
        <span style="font-weight:600;">${log.name}</span>
        <span style="color:var(--gold); font-size:12.5px; font-weight:600;">${userRank}</span>
        <span class="mono" style="color:var(--gold); font-weight:600;">${formatBadge(log.badge)}</span>
        <span class="mono" style="font-size:12.5px; color:var(--muted);">${formatDisplayDateTime(log.clock_in_time)}</span>
        <span class="mono" style="font-size:12.5px; color:var(--muted);">${isWorking ? '-' : formatDisplayDateTime(log.clock_out_time)}</span>
        <span class="badge ${isWorking ? 'ok' : 'steel'}">${isWorking ? '근무 중' : '퇴근'}</span>
      </div>`;
    });
  }
  html += `</div>`;
  return html;
}

/* ------------------------------ 사이드 공지 탭 (검색 기능 포함) ------------------------------ */

function renderNoticeList(notices, canManage) {
  if (notices.length === 0) {
    const emptyMsg = NOTICE_SEARCH.trim() ? "검색 결과가 없습니다." : "등록된 공지가 없습니다.";
    return `<div style="padding:36px; text-align:center; color:var(--muted); font-size:13.5px; border-top:1px solid var(--line);">${emptyMsg}</div>`;
  }
  let html = "";
  notices.forEach((n, idx) => {
    const displayId = (idx + 1).toString().padStart(4, '0');
    html += `
    <div class="notice-row row-hover">
      <div class="mono notice-id">${displayId}</div>
      <div class="notice-body">
         <div class="notice-title">${n.title}</div>
         <textarea class="notice-textarea" readonly id="notice_text_${n.id}">${n.content}</textarea>
      </div>
      <div class="notice-actions">
         <button class="btn-ghost" data-action="copy-notice" data-id="${n.id}" style="padding:7px; font-size:12px;">복사</button>
         ${canManage ? `<button class="btn-ghost danger" data-action="del-notice" data-id="${n.id}" style="padding:7px; font-size:12px;">삭제</button>` : ""}
      </div>
    </div>`;
  });
  return html;
}

function getFilteredNotices() {
  const query = NOTICE_SEARCH.trim().toLowerCase();
  if (!query) return DATA.sideNotices;
  return DATA.sideNotices.filter(n =>
    (n.title && n.title.toLowerCase().includes(query)) ||
    (n.content && n.content.toLowerCase().includes(query))
  );
}

function renderNotices() {
  const canManage = hasPermission("notices");
  const filtered = getFilteredNotices();

  const createFormHtml = canManage ? `
    <div class="panel" style="padding:18px; margin-bottom:22px; display:flex; gap:12px; flex-direction:column;">
      <div class="field"><label>새 공지 제목 (예: 서부 ATM)</label><input id="snTitle" placeholder="제목 입력" style="width:100%; max-width:420px;"/></div>
      <div class="field"><label>복사될 내용 (클립보드 양식)</label><textarea id="snContent" placeholder="/보안국 [ 젤리 보안국 ] 서부 ATM에서..." style="width:100%; min-height:85px;"></textarea></div>
      <button data-action="submit-notice" class="btn-gold" style="align-self:flex-start;">공지 추가</button>
    </div>` : "";

  return `
    ${header("사이드 공지", `복사하여 바로 사용할 수 있는 사전 지정 양식 (전체 ${DATA.sideNotices.length}건${NOTICE_SEARCH.trim() ? ` · 검색결과 ${filtered.length}건` : ""})`)}
    ${createFormHtml}
    <div class="panel" style="display:flex; align-items:center; gap:8px; margin-bottom:14px; padding:6px 14px; max-width:320px;">
      <span style="color:var(--muted);">⌕</span>
      <input id="noticeSearch" data-action="search-notices" value="${NOTICE_SEARCH}" placeholder="제목 또는 내용 검색" style="background:transparent; border:none; padding:6px 0; width:100%; box-shadow:none;" />
    </div>
    <div class="panel">
      <div style="display:flex; padding:12px 18px; border-bottom:1px solid var(--line); font-size:12px; color:var(--muted); font-weight:600; text-align:center;">
         <div style="width:60px;">#</div>
         <div style="flex:1;">사이드 공지 - 제목 / 클립보드(복사) 내용</div>
         <div style="width:${canManage ? "70px" : "50px"};">작업</div>
      </div>
      <div id="noticeList">${renderNoticeList(filtered, canManage)}</div>
    </div>`;
}

function renderApps() {
  const pending = DATA.applications.filter(a => a.status === "요청됨");
  const decided = DATA.applications.filter(a => a.status !== "요청됨");
  return `
    ${header("가입 신청 관리", `대기 ${pending.length}건`)}
    <div class="mono" style="font-size:11.5px; color:var(--muted); margin-bottom:18px; line-height:1.6;">
      가입 신청은 지원자가 로그인 화면에서 팩션 코드(<span style="color:var(--gold); font-weight:600;">${DATA.code}</span>)를 입력해 접수됩니다.
    </div>
    <div style="font-size:13px; color:var(--muted); margin-bottom:10px; font-weight:700;">대기 중</div>
    <div class="panel" style="margin-bottom:24px;">
      ${pending.length === 0 ? `<div style="padding:24px; text-align:center; color:var(--muted); font-size:13.5px;">대기 중인 신청이 없습니다.</div>` :
      pending.map(a => `<div class="row-hover" style="display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-top:1px solid var(--line);">
          <div><div style="font-size:14px; font-weight:600;">${a.name} <span class="mono" style="color:var(--muted); font-size:12px; font-weight:400;">· 고유번호 ${formatBadge(a.uid)}${a.username ? ` · 아이디 ${a.username}` : ""}</span></div></div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="badge ok">요청됨</span>
            <button class="icon-btn" data-action="decide-app" data-id="${a.id}" data-status="승인" style="border-color:var(--ok); color:var(--ok);">✓</button>
            <button class="icon-btn" data-action="decide-app" data-id="${a.id}" data-status="반려" style="border-color:var(--danger); color:var(--danger);">✕</button>
          </div>
        </div>`).join("")}
    </div>
    <div style="font-size:13px; color:var(--muted); margin-bottom:10px; font-weight:700;">처리 완료</div>
    <div class="panel">
      ${decided.length === 0 ? `<div style="padding:24px; text-align:center; color:var(--muted); font-size:13.5px;">처리 이력이 없습니다.</div>` :
      decided.map(a => `<div style="display:flex; justify-content:space-between; padding:12px 18px; border-top:1px solid var(--line); font-size:13.5px;">
          <span style="font-weight:500;">${a.name}</span><span class="badge ${a.status === "승인" ? "ok" : "danger"}">${a.status}</span>
        </div>`).join("")}
    </div>`;
}

function renderWarn() {
  const membersByRank = {};
  RANKS.forEach(r => membersByRank[r] = []);

  DATA.accounts.filter(a => a.status === "재직").forEach(a => {
    if (membersByRank[a.rank]) {
      membersByRank[a.rank].push(a);
    } else {
      if (!membersByRank["기타"]) membersByRank["기타"] = [];
      membersByRank["기타"].push(a);
    }
  });

  let targetOptions = `<option value="">대상자를 선택하세요</option>`;
  RANKS.forEach(r => {
    if (membersByRank[r] && membersByRank[r].length > 0) {
      targetOptions += `<optgroup label="${r}">`;
      membersByRank[r].forEach(a => {
        targetOptions += `<option value="${a.name}">${a.name} (No.${formatBadge(a.badge)})</option>`;
      });
      targetOptions += `</optgroup>`;
    }
  });
  if (membersByRank["기타"] && membersByRank["기타"].length > 0) {
    targetOptions += `<optgroup label="기타">`;
    membersByRank["기타"].forEach(a => {
      targetOptions += `<option value="${a.name}">${a.name} (No.${formatBadge(a.badge)})</option>`;
    });
    targetOptions += `</optgroup>`;
  }

  return `
    ${header("내부경고 관리", `누적 ${DATA.warnings.length}건`)}
    <div class="panel" style="padding:18px; margin-bottom:22px; display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
      <div class="field">
        <label>대상자</label>
        <select id="wTarget" style="width:180px;">
          ${targetOptions}
        </select>
      </div>
      <div class="field"><label>사유</label><input id="wReason" style="width:280px;" placeholder="경고 사유 입력" /></div>
      <div class="field"><label>수위</label>
        <select id="wSeverity"><option>경고</option><option>중경고</option><option>최종경고</option></select>
      </div>
      <button data-action="submit-warn" class="btn-gold">등록</button>
    </div>
    <div class="panel">
      ${DATA.warnings.length === 0 ? `<div style="padding:28px; text-align:center; color:var(--muted); font-size:13.5px;">등록된 내부경고가 없습니다.</div>` :
      [...DATA.warnings].reverse().map(w => `<div class="row-hover" style="display:flex; justify-content:space-between; align-items:center; padding:12px 18px; border-top:1px solid var(--line);">
          <div><div style="font-size:14px;"><strong style="font-weight:600;">${w.target_name || w.targetName}</strong> <span style="color:var(--muted);">· ${w.reason}</span></div>
          <div class="mono" style="font-size:11.5px; color:var(--muted); margin-top:3px;">${w.date} · 발부: ${w.issued_by || w.issuedBy}</div></div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="badge ${w.severity === "최종경고" ? "danger" : w.severity === "중경고" ? "gold" : "steel"}">${w.severity}</span>
            <button class="icon-btn" data-action="remove-warn" data-id="${w.id}">🗑</button>
          </div>
        </div>`).join("")}
    </div>`;
}

function renderAccounts() {
  const cols = "1fr 1fr 1.2fr 2fr 0.5fr";
  let rows = `<div class="table-head" style="grid-template-columns:${cols};"><span>이름</span><span>아이디</span><span>새 비밀번호</span><span>메뉴 권한 할당 (팩션장/임원 제외)</span><span></span></div>`;

  const PERM_LABELS = { members: "팩션원", attendance: "근태", notices: "공지", apps: "가입", warn: "경고" };

  DATA.accounts.forEach(a => {
    const userPerms = a.permissions || [];
    const isTopAdmin = (a.rank === "위원장" || a.isOwner);

    let permHtml = `<div style="display:flex; gap:8px; flex-wrap:wrap; font-size:11.5px;">`;
    if (isTopAdmin) {
      permHtml += `<span style="color:var(--gold); font-weight:bold;">모든 권한 보유 (임원직/팩션장)</span>`;
    } else {
      Object.entries(PERM_LABELS).forEach(([key, label]) => {
        const checked = userPerms.includes(key) ? "checked" : "";
        permHtml += `<label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                      <input type="checkbox" data-action="toggle-permission" data-id="${a.id}" data-perm="${key}" ${checked}> ${label}
                    </label>`;
      });
    }
    permHtml += `</div>`;

    rows += `<div class="table-row row-hover" style="grid-template-columns:${cols}; align-items:center;">
      <span style="font-weight:600;">${a.name}${a.id === SESSION.id ? '<span class="mono" style="color:var(--gold); font-size:11px;"> (나)</span>' : ''}${a.isOwner ? '<span class="mono" style="color:var(--gold); font-size:10px; border:1px solid var(--gold); border-radius:4px; padding:1px 5px; margin-left:6px;">설립자</span>' : ''}</span>
      <span class="mono" style="color:var(--muted);">${a.username}</span>
      <div style="display:flex; gap:6px;">
        <input class="pwInput" data-id="${a.id}" placeholder="변경할 비밀번호" style="padding:6px 10px; font-size:12px; width:100%;" />
        <button class="btn-ghost" data-action="change-password" data-id="${a.id}" style="padding:6px 10px; font-size:12px; white-space:nowrap;">변경</button>
      </div>
      ${permHtml}
      ${a.isOwner ? '' : `<button class="icon-btn" data-action="remove-account" data-id="${a.id}">🗑</button>`}
    </div>`;
  });

  return `
    ${header("계정 및 권한 관리", "로그인 정보 및 하위 계급자들의 특정 메뉴 접근 권한을 관리합니다")}
    <div class="panel">${rows}</div>
    <div class="mono" style="font-size:11.5px; color:var(--muted); margin-top:14px; line-height:1.7;">
      ※ 비밀번호는 SQLite 데이터베이스에 bcrypt 알고리즘으로 암호화되어 안전하게 보관됩니다.<br/>
      ※ 체크박스를 클릭하면 권한이 즉시 서버로 반영됩니다.
    </div>`;
}

function renderSettings() {
  return `
    ${header("설정", "팩션 코드 · 디스코드 웹훅 연동")}
    <div class="panel" style="padding:22px; max-width:540px; margin-bottom:20px;">
      <div class="field"><label>팩션 코드</label></div>
      <div class="code-display" style="font-size:22px; padding:14px 0;">${DATA.code}</div>
      <div class="mono" style="font-size:11.5px; color:var(--muted); margin-top:12px;">신규 가입 신청 시 이 코드가 필요합니다.</div>
    </div>
    <div class="panel" style="padding:22px; max-width:540px;">
      <div class="field" style="margin-bottom:14px;">
        <label>기본 알림 웹훅 URL (출퇴근 등)</label>
        <input id="webhookUrl" class="mono" style="width:100%; font-size:13px;" placeholder="https://discord.com/api/webhooks/..." value="${DATA.webhookUrl || ""}" />
      </div>
      <div class="field">
        <label>RP 보고서 전용 웹훅 URL</label>
        <input id="rpWebhookUrl" class="mono" style="width:100%; font-size:13px;" placeholder="https://discord.com/api/webhooks/..." value="${DATA.rpWebhookUrl || ""}" />
      </div>
      <div style="display:flex; gap:10px; margin-top:14px;">
        <button data-action="save-webhook" class="btn-gold">저장</button>
        <button data-action="test-webhook" class="btn-ghost">➤ 테스트 전송</button>
      </div>
      <div class="mono" style="font-size:11.5px; color:var(--muted); margin-top:16px; line-height:1.7;">
        출퇴근 및 가입 알림은 기본 웹훅으로, RP 보고서는 RP 전용 웹훅으로 전송됩니다.
      </div>
    </div>`;
}

/* ============================================================================
   이벤트 위임
   ============================================================================ */

const CLICK_ACTIONS = {
  "goto-create": () => { VIEW = "create"; render(); },
  "goto-join": () => { VIEW = "join"; render(); },
  "goto-login": () => { VIEW = "login"; render(); },
  "goto-gate": () => { VIEW = "gate"; render(); },

  "switch-tab": (el) => {
    TAB = el.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    refreshTab();
  },

  "logout": () => logout(),

  // 카테고리/선택 관련 클릭은 검색 입력창을 다시 그리지 않도록
  // 탭 전체(refreshTab)가 아니라 결과 영역(#lawResults)만 갱신한다.
  "law-cat": (el) => {
    LAW_CAT = el.dataset.cat;
    document.querySelectorAll('[data-action="law-cat"]').forEach(btn => {
      const active = btn.dataset.cat === LAW_CAT;
      btn.classList.toggle('active', active);
      btn.style.background = active ? 'var(--gold)' : '';
      btn.style.color = active ? '#000' : '';
    });
    refreshLawResults();
  },
  "law-toggle": (el) => {
    const key = el.dataset.key;
    if (LAW_SELECTED.has(key)) LAW_SELECTED.delete(key);
    else LAW_SELECTED.add(key);
    LAW_LAST_CLICKED = LAW_DATA.find(i => getLawKey(i) === key);
    refreshLawResults();
  },
  "law-select-all": () => {
    LAW_DATA.forEach(i => LAW_SELECTED.add(getLawKey(i)));
    refreshLawResults();
  },
  "law-clear-all": () => {
    LAW_SELECTED.clear();
    refreshLawResults();
  },

  "toggle-work": async () => {
    try {
      const res = await apiCall("/attendance/toggle", "POST");
      const statusText = res.isClockIn ? "출근" : "퇴근";
      showToast(`[${SESSION.rank}] ${SESSION.name} 님, ${statusText} 처리되었습니다.`, res.isClockIn ? "ok" : "danger");
      await fetchFactionData();
    } catch (e) { }
  },

  "submit-notice": async () => {
    const title = document.getElementById("snTitle").value.trim();
    const content = document.getElementById("snContent").value.trim();
    if (!title || !content) { showToast("제목과 내용을 모두 입력하세요", "danger"); return; }

    try {
      await apiCall("/notices", "POST", { title, content });
      showToast("공지가 추가되었습니다");
      await fetchFactionData();
    } catch (e) { }
  },
  "del-notice": async (el) => {
    try {
      await apiCall(`/notices/${el.dataset.id}`, "DELETE");
      showToast("공지가 삭제되었습니다", "danger");
      await fetchFactionData();
    } catch (e) { }
  },
  "copy-notice": (el) => {
    const id = el.dataset.id;
    const textarea = document.getElementById(`notice_text_${id}`);
    if (textarea) {
      textarea.select();
      textarea.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(textarea.value).then(() => {
        showToast("클립보드에 복사되었습니다", "ok");
      }).catch(err => {
        showToast("복사 실패. 브라우저 설정을 확인하세요.", "danger");
      });
    }
  },

  "toggle-add-member": () => {
    const f = document.getElementById("addMemberForm");
    f.style.display = f.style.display === "none" ? "flex" : "none";
  },
  "export-members": () => {
    const ws = XLSX.utils.json_to_sheet(DATA.accounts.map(a => ({
      이름: a.name, 고유번호: formatBadge(a.badge), 계급: a.rank, 등급: getRankCategory(a.rank), 상태: a.status, 아이디: a.username, 가입일: a.join_date || a.joinDate
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "팩션원명단");
    XLSX.writeFile(wb, `${DATA.name}_팩션원명단.xlsx`);
    showToast("엑셀 파일을 내려받았습니다");
  },
  "submit-member": async () => {
    const name = document.getElementById("mName").value.trim();
    const badgeRaw = document.getElementById("mBadge").value.trim();
    const badge = formatBadge(badgeRaw);
    const rank = document.getElementById("mRank").value;
    if (!name || !badge) { showToast("이름과 고유번호를 입력하세요", "danger"); return; }

    try {
      const res = await apiCall("/members", "POST", { name, badge, rank });
      showToast(`${name} 팩션원 등록 완료 (초기 계정 ${res.username})`);
      document.getElementById("addMemberForm").style.display = "none";
      await fetchFactionData();
    } catch (e) { }
  },
  "toggle-status": async (el) => {
    const id = el.dataset.id;
    try {
      await apiCall(`/members/${id}/status`, "PATCH");
      showToast("상태가 변경되었습니다");
      const acc = DATA.accounts.find(a => String(a.id) === String(id));
      if (acc) acc.status = acc.status === "재직" ? "해임" : "재직";
      refreshTab();
    } catch (e) { }
  },
  "decide-app": async (el) => {
    const status = el.dataset.status;
    try {
      const res = await apiCall(`/applications/${el.dataset.id}/decide`, "PATCH", { status });
      if (res.createdUser) {
        showToast(`승인 완료 (아이디: ${res.createdUser.username}) · 신청자가 설정한 비밀번호로 로그인 가능합니다`, "ok");
      } else {
        showToast("가입 신청을 반려했습니다", "danger");
      }
      await fetchFactionData();
    } catch (e) { }
  },

  "submit-warn": async () => {
    const targetName = document.getElementById("wTarget").value.trim();
    const reason = document.getElementById("wReason").value.trim();
    const severity = document.getElementById("wSeverity").value;

    if (!targetName || !reason) { showToast("대상자와 사유를 입력하세요", "danger"); return; }

    try {
      await apiCall("/warnings", "POST", { targetName, reason, severity });
      showToast("내부경고가 등록되었습니다");
      await fetchFactionData();
    } catch (e) { }
  },
  "remove-warn": async (el) => {
    try {
      await apiCall(`/warnings/${el.dataset.id}`, "DELETE");
      showToast("삭제되었습니다", "danger");
      await fetchFactionData();
    } catch (e) { }
  },

  "change-password": async (el) => {
    const id = el.dataset.id;
    const input = document.querySelector(`.pwInput[data-id="${id}"]`);
    const newPassword = input.value;
    if (!newPassword || newPassword.length < 6) { showToast("6자 이상 입력하세요", "danger"); return; }

    try {
      await apiCall(`/members/${id}/password`, "PATCH", { newPassword });
      showToast("비밀번호가 변경되었습니다");
      input.value = "";
    } catch (e) { }
  },
  "remove-account": async (el) => {
    const id = el.dataset.id;
    try {
      await apiCall(`/members/${id}`, "DELETE");
      showToast("계정이 삭제되었습니다", "danger");
      DATA.accounts = DATA.accounts.filter(a => String(a.id) !== String(id));
      refreshTab();
    } catch (e) { }
  },

  "save-webhook": async () => {
    const webhookUrl = document.getElementById("webhookUrl").value.trim();
    const rpWebhookUrl = document.getElementById("rpWebhookUrl").value.trim();
    try {
      await apiCall("/settings/webhook", "PATCH", { webhookUrl, rpWebhookUrl });
      showToast("웹훅 주소가 저장되었습니다");
      await fetchFactionData();
    } catch (e) { }
  },
  "test-webhook": async () => {
    const webhookUrl = document.getElementById("webhookUrl").value.trim();
    if (!webhookUrl) { showToast("웹훅 주소를 먼저 입력하세요.", "danger"); return; }
    try {
      await apiCall("/settings/webhook-test", "POST", { webhookUrl });
      showToast("디스코드로 테스트 메시지를 전송했습니다");
    } catch (e) { }
  },
};

const SUBMIT_ACTIONS = {
  "submit-create": async () => {
    const name = document.getElementById("cfName").value.trim();
    const founderName = document.getElementById("cfFounderName").value.trim();
    const badge = document.getElementById("cfBadge").value.trim();
    const username = document.getElementById("cfUser").value.trim();
    const password = document.getElementById("cfPass").value;
    const err = document.getElementById("createErr");

    if (!name || !founderName || !badge || !username || password.length < 6) {
      err.textContent = "모든 항목을 입력하세요 (비밀번호 6자 이상)"; err.style.display = "block"; return;
    }

    const code = genFactionCode();
    try {
      await apiCall("/factions/create", "POST", { code, name, founderName, username, password, badge });
      LAST = { code, factionName: name };
      VIEW = "createDone"; render();
    } catch (e) { }
  },
  "submit-join": async () => {
    const code = document.getElementById("jfCode").value.trim().toUpperCase();
    const name = document.getElementById("jfName").value.trim();
    const uid = formatBadge(document.getElementById("jfUid").value.trim());
    const username = document.getElementById("jfUser").value.trim();
    const password = document.getElementById("jfPass").value;
    const err = document.getElementById("joinErr");

    if (!code || !name || !uid || !username || password.length < 6) {
      err.textContent = "모든 항목을 입력하세요 (비밀번호 6자 이상)"; err.style.display = "block"; return;
    }

    try {
      await apiCall("/factions/join-request", "POST", { code, name, uid, username, password });
      VIEW = "joinSent"; render();
    } catch (e) {
      if (err) { err.textContent = e.message; err.style.display = "block"; }
    }
  },
  "submit-login": async () => {
    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value;
    const errEl = document.getElementById("loginErr");

    try {
      const res = await apiCall("/auth/login", "POST", { username, password });
      TOKEN = res.token;
      SESSION = res.user;
      localStorage.setItem("bureau_token", TOKEN);
      localStorage.setItem("bureau_session", JSON.stringify(SESSION));

      await fetchFactionData();
      TAB = "dash";
    } catch (e) {
      if (errEl) { errEl.textContent = e.message; errEl.style.display = "block"; }
    }
  },
  "submit-rp-report": async () => {
    const location = document.getElementById("rpLocation").value.trim();
    const targetFaction = document.getElementById("rpTargetFaction").value.trim();
    const result = document.getElementById("rpResult").value.trim();
    const content = document.getElementById("rpContent").value.trim();

    try {
      await apiCall("/rp-reports", "POST", { location, targetFaction, result, content });
      showToast("RP 보고서가 디스코드로 전송되었습니다!", "ok");
      // 새로 저장된 보고서를 목록/순위에 즉시 반영 (탭 전체가 다시 그려지며 입력폼도 초기화됨)
      await fetchFactionData();
    } catch (e) { }
  }
};

const CHANGE_ACTIONS = {
  "change-rank": async (el) => {
    const id = el.dataset.id;
    const newRank = el.value;
    const prevRank = el.dataset.prevRank || (DATA.accounts.find(a => String(a.id) === String(id)) || {}).rank;
    try {
      await apiCall(`/members/${id}/rank`, "PATCH", { rank: newRank });
      showToast("계급이 변경되었습니다");
      // 서버 재조회 없이 로컬 데이터만 갱신 (불필요한 네트워크 왕복 제거)
      const acc = DATA.accounts.find(a => String(a.id) === String(id));
      if (acc) acc.rank = newRank;
      refreshTab();
    } catch (e) {
      if (prevRank) el.value = prevRank; // 실패 시 이전 값으로 복구
    }
  },
  "toggle-permission": async (el) => {
    const id = el.dataset.id;
    const perm = el.dataset.perm;
    const isGranted = el.checked;

    try {
      await apiCall(`/members/${id}/permissions`, "PATCH", { permission: perm, granted: isGranted });
      showToast(`${isGranted ? '권한 부여됨' : '권한 해제됨'}`);
      const acc = DATA.accounts.find(a => String(a.id) === String(id));
      if (acc) {
        acc.permissions = acc.permissions || [];
        if (isGranted) {
          if (!acc.permissions.includes(perm)) acc.permissions.push(perm);
        } else {
          acc.permissions = acc.permissions.filter(p => p !== perm);
        }
      }
    } catch (e) {
      el.checked = !isGranted; // 실패 시 원래 상태로 복구
    }
  }
};

const INPUT_ACTIONS = {
  "search-members": (el) => {
    const q = el.value;
    const list = DATA.accounts.filter(a => a.name.includes(q) || String(a.badge || "").includes(q));
    document.getElementById("memberList").innerHTML = renderMemberRows(list);
  },
  "law-search": (el) => {
    // 결과 영역만 갱신하고 검색창 자체(el)는 건드리지 않는다 -> 포커스/커서 유지
    LAW_SEARCH = el.value;
    refreshLawResults();
  },
  "search-notices": (el) => {
    // 캐럿(커서) 위치를 보존하기 위해 전체 탭이 아닌 목록 부분만 갱신한다.
    NOTICE_SEARCH = el.value;
    const canManage = hasPermission("notices");
    const filtered = getFilteredNotices();
    const listEl = document.getElementById("noticeList");
    if (listEl) listEl.innerHTML = renderNoticeList(filtered, canManage);
  }
};

function initEventDelegation() {
  const app = document.getElementById("app");
  app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !CLICK_ACTIONS[el.dataset.action]) return;
    CLICK_ACTIONS[el.dataset.action](el, e);
  });
  app.addEventListener("submit", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !SUBMIT_ACTIONS[el.dataset.action]) return;
    e.preventDefault();
    SUBMIT_ACTIONS[el.dataset.action](el, e);
  });
  app.addEventListener("change", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !CHANGE_ACTIONS[el.dataset.action]) return;
    CHANGE_ACTIONS[el.dataset.action](el, e);
  });
  app.addEventListener("input", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !INPUT_ACTIONS[el.dataset.action]) return;
    INPUT_ACTIONS[el.dataset.action](el, e);
  });
}

/* ------------------------------ 초기화 ------------------------------ */

(async function init() {
  initEventDelegation();
  if (TOKEN && SESSION) {
    await fetchFactionData();
  } else {
    render();
  }
})();
