/* ============================================================================
   보안국 인트라넷 — 백엔드 API 연동 버전 (Express + SQLite)
   ============================================================================ */

const API_BASE = "https://lsrhjru.wisp.uno/api";
const RANKS = ["위원장", "부위원장", "본부장", "총감", "차관보", "사령관", "참모장", "감찰관", "작전관", "지휘관", "특별보안관", "감독관", "수사관", "보안관", "교육생"];

let TOKEN = localStorage.getItem("bureau_token") || null;
let SESSION = JSON.parse(localStorage.getItem("bureau_session") || "null");
let DATA = null; // 백엔드 DB에서 조회해 온 현재 팩션 전체 데이터
let TAB = "dash";
let VIEW = "gate";
let LAST = {};

/* ------------------------------ API 연동 유틸 ------------------------------ */

// 백엔드 REST API 통신 공통 함수
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

// 백엔드에서 최신 팩션 데이터 불러오기
async function fetchFactionData() {
  if (!TOKEN) return;
  try {
    const res = await apiCall("/faction/data");
    DATA = res.faction;
    render();
  } catch (e) {
    logout();
  }
}

function showToast(msg, kind) {
  const el = document.getElementById("toast");
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

const TABS = [
  { key: "dash", label: "대시보드" },
  { key: "members", label: "팩션원 관리" },
  { key: "attendance", label: "근태 관리" },
  { key: "notices", label: "사이드 공지" },
  { key: "apps", label: "가입 신청" },
  { key: "warn", label: "내부경고" },
  { key: "accounts", label: "계정 관리" },
  { key: "settings", label: "설정" },
];

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
  app.innerHTML = renderShell();
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
      <div class="field" style="margin-top:14px;"><label>고유번호</label><input id="jfUid" class="mono" style="width:100%;" placeholder="예) 991234" /></div>
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

function renderShell() {
  const isWorking = DATA.attendance.find(a => a.user_id === SESSION.id && !a.clock_out_time);
  const workBtnHtml = isWorking
    ? `<button data-action="toggle-work" class="btn-ghost danger" style="margin-top:10px; width:100%; padding:9px 0; font-size:12.5px; font-weight:600;">퇴근하기 (근무 중)</button>`
    : `<button data-action="toggle-work" class="btn-ghost ok" style="margin-top:10px; width:100%; padding:9px 0; font-size:12.5px; font-weight:600;">출근하기</button>`;

  return `
  <div style="min-height:100vh; display:flex; position:relative; background:var(--bg);">
    <aside class="panel" style="width:230px; margin:16px 0 16px 16px; border-radius:var(--radius-lg); display:flex; flex-direction:column; flex-shrink:0;">
      <div style="padding:22px 20px; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--line);">
        ${sealSvg(42)}
        <div>
          <div class="disp" style="font-size:15px; font-weight:700; color:var(--text);">${DATA.name}</div>
          <div class="mono" style="font-size:10px; color:var(--muted); font-weight:600;">INTRANET SYS</div>
        </div>
      </div>
      <nav style="padding:14px; display:flex; flex-direction:column; gap:4px; flex:1;">
        ${TABS.map(t => `<button class="tab-btn ${TAB === t.key ? 'active' : ''}" data-action="switch-tab" data-tab="${t.key}">${t.label}</button>`).join("")}
      </nav>
      <div style="padding:16px; border-top:1px solid var(--line); background:var(--panel2); border-radius:0 0 var(--radius-lg) var(--radius-lg);">
        <div style="font-size:13.5px; font-weight:700;">${SESSION.name}</div>
        <div class="mono" style="font-size:11px; color:var(--gold); font-weight:600; margin-top:2px;">${SESSION.rank} · No.${SESSION.badge}</div>
        ${workBtnHtml}
        <button data-action="logout" class="btn-ghost" style="margin-top:8px; width:100%; padding:8px 0; font-size:12px; border-color:var(--line); color:var(--muted);">로그아웃</button>
      </div>
    </aside>
    <main style="flex:1; padding:24px 28px; overflow:auto; position:relative; z-index:1;">
      <div class="fade-up" id="tabContent">${renderTab()}</div>
    </main>
  </div>`;
}

function renderTab() {
  if (TAB === "dash") return renderDash();
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
  const pendingApps = DATA.applications.filter(a => a.status === "요청됨").length;
  const warnCount = DATA.warnings.length;
  const recent = [...DATA.warnings].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
  return `
    ${header("대시보드", `${SESSION.name} 님, 오늘도 수고 많으십니다.`)}
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
    <div class="panel">
      <div style="padding:14px 20px; border-bottom:1px solid var(--line); font-size:13px; color:var(--muted); font-weight:700;">최근 내부경고</div>
      ${recent.length === 0 ? `<div style="padding:30px; text-align:center; color:var(--muted); font-size:13.5px;">등록된 내부경고가 없습니다.</div>` :
      recent.map(w => `<div class="row-hover" style="padding:12px 20px; border-top:1px solid var(--line); display:flex; justify-content:space-between; font-size:13.5px;">
          <span><strong style="color:var(--text);">${w.target_name}</strong> <span style="color:var(--muted);">· ${w.reason}</span></span>
          <span class="mono" style="color:var(--muted); font-size:12px;">${w.date}</span>
        </div>`).join("")}
    </div>`;
}

function renderMembers() {
  return `
    ${header("팩션원 관리", `총 ${DATA.accounts.length}명 등록됨`,
    `<button data-action="export-members" class="btn-ghost">⭳ 엑셀 추출</button>
       <button data-action="toggle-add-member" class="btn-gold">+ 팩션원 등록</button>`)}
    <div id="addMemberForm" class="panel" style="display:none; padding:18px; margin-bottom:18px; gap:12px; align-items:flex-end; flex-wrap:wrap; flex-direction:row;">
      <div class="field"><label>이름</label><input id="mName" /></div>
      <div class="field"><label>배지번호</label><input id="mBadge" class="mono" style="width:110px;" /></div>
      <div class="field"><label>계급</label><select id="mRank">${RANKS.map(r => `<option value="${r}">${r}</option>`).join("")}</select></div>
      <button data-action="submit-member" class="btn-gold">등록</button>
    </div>
    <div class="panel" style="display:flex; align-items:center; gap:8px; margin-bottom:14px; padding:6px 14px; max-width:280px;">
      <span style="color:var(--muted);">⌕</span>
      <input id="memberSearch" data-action="search-members" placeholder="이름 또는 배지번호 검색" style="background:transparent; border:none; padding:6px 0; width:100%; box-shadow:none;" />
    </div>
    <div class="panel" id="memberList">${renderMemberRows(DATA.accounts)}</div>`;
}

function renderMemberRows(list) {
  const cols = "1.4fr 0.8fr 1fr 0.8fr 1fr 0.8fr";
  let html = `<div class="table-head" style="grid-template-columns:${cols};"><span>이름</span><span>배지</span><span>계급</span><span>상태</span><span>가입일</span><span></span></div>`;
  if (list.length === 0) { html += `<div style="padding:28px; text-align:center; color:var(--muted); font-size:13.5px;">검색 결과가 없습니다.</div>`; return html; }
  list.forEach(a => {
    html += `<div class="table-row row-hover" style="grid-template-columns:${cols};" data-id="${a.id}">
      <span style="font-weight:600;">${a.name}</span>
      <span class="mono" style="color:var(--gold); font-weight:600;">${a.badge}</span>
      <select data-action="change-rank" data-id="${a.id}" style="padding:5px 8px; font-size:12.5px;">${RANKS.map(r => `<option value="${r}" ${r === a.rank ? "selected" : ""}>${r}</option>`).join("")}</select>
      <span class="badge ${a.status === "재직" ? "ok" : "danger"}">${a.status}</span>
      <span class="mono" style="color:var(--muted); font-size:12px;">${a.join_date || a.joinDate || "-"}</span>
      <button class="btn-ghost" data-action="toggle-status" data-id="${a.id}" style="padding:5px 12px; font-size:12px; justify-self:start;">${a.status === "재직" ? "해임 처리" : "복직 처리"}</button>
    </div>`;
  });
  return html;
}

function renderAttendance() {
  const logs = [...DATA.attendance].reverse();
  const cols = "1.2fr 0.8fr 1.5fr 1.5fr 1fr";

  let html = `
    ${header("근태 관리", "인원들의 출퇴근 기록을 확인합니다.")}
    <div class="panel">
      <div class="table-head" style="grid-template-columns:${cols};">
        <span>이름</span><span>배지</span><span>출근 시간</span><span>퇴근 시간</span><span>상태</span>
      </div>`;

  if (logs.length === 0) {
    html += `<div style="padding:28px; text-align:center; color:var(--muted); font-size:13.5px;">출퇴근 기록이 없습니다.</div>`;
  } else {
    logs.forEach(log => {
      const isWorking = !log.clock_out_time;
      html += `<div class="table-row row-hover" style="grid-template-columns:${cols};">
        <span style="font-weight:600;">${log.name}</span>
        <span class="mono" style="color:var(--gold); font-weight:600;">${log.badge}</span>
        <span class="mono" style="font-size:12.5px; color:var(--muted);">${log.clock_in_time}</span>
        <span class="mono" style="font-size:12.5px; color:var(--muted);">${isWorking ? '-' : log.clock_out_time}</span>
        <span class="badge ${isWorking ? 'ok' : 'steel'}">${isWorking ? '근무 중' : '퇴근'}</span>
      </div>`;
    });
  }
  html += `</div>`;
  return html;
}

function renderNotices() {
  const notices = DATA.sideNotices;

  let listHtml = "";
  if (notices.length === 0) {
    listHtml = `<div style="padding:36px; text-align:center; color:var(--muted); font-size:13.5px; border-top:1px solid var(--line);">등록된 공지가 없습니다.</div>`;
  } else {
    notices.forEach((n, idx) => {
      const displayId = (idx + 1).toString().padStart(4, '0');
      listHtml += `
      <div class="notice-row row-hover">
        <div class="mono notice-id">${displayId}</div>
        <div class="notice-body">
           <div class="notice-title">${n.title}</div>
           <textarea class="notice-textarea" readonly id="notice_text_${n.id}">${n.content}</textarea>
        </div>
        <div class="notice-actions">
           <button class="btn-ghost" data-action="copy-notice" data-id="${n.id}" style="padding:7px; font-size:12px;">복사</button>
           <button class="btn-ghost danger" data-action="del-notice" data-id="${n.id}" style="padding:7px; font-size:12px;">삭제</button>
        </div>
      </div>`;
    });
  }

  return `
    ${header("사이드 공지", `복사하여 바로 사용할 수 있는 사전 지정 양식 (개수 : ${notices.length})`)}
    <div class="panel" style="padding:18px; margin-bottom:22px; display:flex; gap:12px; flex-direction:column;">
      <div class="field"><label>새 공지 제목 (예: 서부 ATM)</label><input id="snTitle" placeholder="제목 입력" style="width:100%; max-width:420px;"/></div>
      <div class="field"><label>복사될 내용 (클립보드 양식)</label><textarea id="snContent" placeholder="/보안국 [ 젤리 보안국 ] 서부 ATM에서..." style="width:100%; min-height:85px;"></textarea></div>
      <button data-action="submit-notice" class="btn-gold" style="align-self:flex-start;">공지 추가</button>
    </div>
    
    <div class="panel">
      <div style="display:flex; padding:12px 18px; border-bottom:1px solid var(--line); font-size:12px; color:var(--muted); font-weight:600; text-align:center;">
         <div style="width:60px;">#</div>
         <div style="flex:1;">사이드 공지 - 제목 / 클립보드(복사) 내용</div>
         <div style="width:70px;">작업</div>
      </div>
      ${listHtml}
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
          <div><div style="font-size:14px; font-weight:600;">${a.name} <span class="mono" style="color:var(--muted); font-size:12px; font-weight:400;">· 고유번호 ${a.uid || "-"}</span></div></div>
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
  return `
    ${header("내부경고 관리", `누적 ${DATA.warnings.length}건`)}
    <div class="panel" style="padding:18px; margin-bottom:22px; display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
      <div class="field"><label>대상자</label><input id="wTarget" /></div>
      <div class="field"><label>사유</label><input id="wReason" style="width:280px;" /></div>
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
  const cols = "1fr 1fr 1.4fr 0.6fr 0.5fr";
  let rows = `<div class="table-head" style="grid-template-columns:${cols};"><span>이름</span><span>아이디</span><span>새 비밀번호</span><span></span><span></span></div>`;
  DATA.accounts.forEach(a => {
    rows += `<div class="table-row row-hover" style="grid-template-columns:${cols};">
      <span style="font-weight:600;">${a.name}${a.id === SESSION.id ? '<span class="mono" style="color:var(--gold); font-size:11px;"> (나)</span>' : ''}</span>
      <span class="mono" style="color:var(--muted);">${a.username}</span>
      <input class="pwInput" data-id="${a.id}" placeholder="변경할 비밀번호" style="padding:6px 10px; font-size:12.5px;" />
      <button class="btn-ghost" data-action="change-password" data-id="${a.id}" style="padding:6px 12px; font-size:12px;">변경</button>
      <button class="icon-btn" data-action="remove-account" data-id="${a.id}">🗑</button>
    </div>`;
  });
  return `
    ${header("계정 관리", "로그인 아이디와 비밀번호를 관리합니다")}
    <div class="panel">${rows}</div>
    <div class="mono" style="font-size:11.5px; color:var(--muted); margin-top:14px; line-height:1.7;">
      ※ 비밀번호는 SQLite 데이터베이스에 bcrypt 알고리즘으로 암호화되어 안전하게 보관됩니다.
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
      <div class="field"><label>디스코드 웹훅 URL</label>
        <input id="webhookUrl" class="mono" style="width:100%; font-size:13px;" placeholder="https://discord.com/api/webhooks/..." value="${DATA.webhookUrl || ""}" />
      </div>
      <div style="display:flex; gap:10px; margin-top:14px;">
        <button data-action="save-webhook" class="btn-gold">저장</button>
        <button data-action="test-webhook" class="btn-ghost">➤ 테스트 전송</button>
      </div>
      <div class="mono" style="font-size:11.5px; color:var(--muted); margin-top:16px; line-height:1.7;">
        출퇴근 기록 및 가입 승인 등 주요 이벤트 발생 시 디스코드로 알림이 전송됩니다.
      </div>
    </div>`;
}

/* ============================================================================
   이벤트 위임 (백엔드 REST API 연결)
   ============================================================================ */

const CLICK_ACTIONS = {
  "goto-create": () => { VIEW = "create"; render(); },
  "goto-join": () => { VIEW = "join"; render(); },
  "goto-login": () => { VIEW = "login"; render(); },
  "goto-gate": () => { VIEW = "gate"; render(); },
  "switch-tab": (el) => { TAB = el.dataset.tab; refreshTab(); },
  "logout": () => logout(),

  "toggle-work": async () => {
    try {
      const res = await apiCall("/attendance/toggle", "POST");
      showToast(res.isClockIn ? "출근 처리되었습니다" : "퇴근 처리되었습니다", res.isClockIn ? "ok" : "danger");
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
    const ws = XLSX.utils.json_to_sheet(DATA.accounts.map(a => ({ 이름: a.name, 배지번호: a.badge, 계급: a.rank, 상태: a.status, 아이디: a.username, 가입일: a.join_date || a.joinDate })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "팩션원명단");
    XLSX.writeFile(wb, `${DATA.name}_팩션원명단.xlsx`);
    showToast("엑셀 파일을 내려받았습니다");
  },
  "submit-member": async () => {
    const name = document.getElementById("mName").value.trim();
    const badge = document.getElementById("mBadge").value.trim();
    const rank = document.getElementById("mRank").value;
    if (!name || !badge) { showToast("이름과 배지번호를 입력하세요", "danger"); return; }

    try {
      const res = await apiCall("/members", "POST", { name, badge, rank });
      showToast(`${name} 팩션원 등록 완료 (초기 계정 ${res.username})`);
      document.getElementById("addMemberForm").style.display = "none";
      await fetchFactionData();
    } catch (e) { }
  },
  "toggle-status": async (el) => {
    try {
      await apiCall(`/members/${el.dataset.id}/status`, "PATCH");
      showToast("상태가 변경되었습니다");
      await fetchFactionData();
    } catch (e) { }
  },
  "decide-app": async (el) => {
    const status = el.dataset.status;
    try {
      const res = await apiCall(`/applications/${el.dataset.id}/decide`, "PATCH", { status });
      if (res.createdUser) {
        showToast(`승인 완료 (생성된 아이디: ${res.createdUser.username})`, "ok");
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
    try {
      await apiCall(`/members/${el.dataset.id}`, "DELETE");
      showToast("계정이 삭제되었습니다", "danger");
      await fetchFactionData();
    } catch (e) { }
  },

  "save-webhook": async () => {
    const webhookUrl = document.getElementById("webhookUrl").value.trim();
    try {
      await apiCall("/settings/webhook", "PATCH", { webhookUrl });
      showToast("웹훅 주소가 저장되었습니다");
      await fetchFactionData();
    } catch (e) { }
  },
  "test-webhook": async () => {
    const webhookUrl = document.getElementById("webhookUrl").value.trim();
    if (!webhookUrl) { showToast("웹훅 주소를 먼저 입력하세요", "danger"); return; }
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
    const username = document.getElementById("cfUser").value.trim();
    const password = document.getElementById("cfPass").value;
    const err = document.getElementById("createErr");

    if (!name || !founderName || !username || password.length < 6) {
      err.textContent = "모든 항목을 입력하세요 (비밀번호 6자 이상)"; err.style.display = "block"; return;
    }

    const code = genFactionCode();
    try {
      await apiCall("/factions/create", "POST", { code, name, founderName, username, password });
      LAST = { code, factionName: name };
      VIEW = "createDone"; render();
    } catch (e) { }
  },
  "submit-join": async () => {
    const code = document.getElementById("jfCode").value.trim().toUpperCase();
    const name = document.getElementById("jfName").value.trim();
    const uid = document.getElementById("jfUid").value.trim();
    const err = document.getElementById("joinErr");

    if (!code || !name || !uid) { err.textContent = "모든 항목을 입력하세요"; err.style.display = "block"; return; }

    try {
      await apiCall("/factions/join-request", "POST", { code, name, uid });
      VIEW = "joinSent"; render();
    } catch (e) { }
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
};

const CHANGE_ACTIONS = {
  "change-rank": async (el) => {
    try {
      await apiCall(`/members/${el.dataset.id}/rank`, "PATCH", { rank: el.value });
      showToast("계급이 변경되었습니다");
    } catch (e) { }
  },
};

const INPUT_ACTIONS = {
  "search-members": (el) => {
    const q = el.value;
    const list = DATA.accounts.filter(a => a.name.includes(q) || a.badge.includes(q));
    document.getElementById("memberList").innerHTML = renderMemberRows(list);
  },
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