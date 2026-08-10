/* ============================================================================
   교체 방법:
   기존 파일에서 CLICK_ACTIONS, SUBMIT_ACTIONS, CHANGE_ACTIONS 세 개의
   const 선언 블록 전체를 아래 내용으로 통째로 바꿔치기 하세요.
   (나머지 코드는 그대로 둡니다.)

   핵심 원칙:
   - 버튼 클릭 → 로컬 DATA를 즉시 수정 → refreshTab()으로 화면부터 갱신
   - 그 다음에 apiCall()을 호출 (화면은 이미 바뀐 상태라 기다림 없음)
   - 실패하면 로컬 DATA를 원래대로 되돌리고 다시 refreshTab()
   - 성공해도 fetchFactionData()로 전체 재조회를 다시 하지 않음
     (필요한 경우에만, 그리고 await 없이 백그라운드로만 살짝 동기화)
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

  // ---- 출퇴근: 로컬에서 즉시 상태 뒤집고, 서버는 백그라운드로 ----
  "toggle-work": async (el) => {
    const wasWorking = DATA.attendance.find(a => a.user_id === SESSION.id && !a.clock_out_time);
    const nowIso = new Date().toISOString();
    let addedEntry = null;

    if (wasWorking) {
      wasWorking.clock_out_time = nowIso;
    } else {
      addedEntry = { user_id: SESSION.id, name: SESSION.name, badge: SESSION.badge, clock_in_time: nowIso, clock_out_time: null };
      DATA.attendance.push(addedEntry);
    }

    const statusText = wasWorking ? "퇴근" : "출근";
    showToast(`[${SESSION.rank}] ${SESSION.name} 님, ${statusText} 처리되었습니다.`, wasWorking ? "danger" : "ok");
    silentSync();

    try {
      await apiCall("/attendance/toggle", "POST");
      // 실제 타임스탬프는 서버 기준일 수 있으니 다음 폴링 때 자연히 맞춰집니다.
    } catch (e) {
      // 실패 시 되돌리기
      if (wasWorking) wasWorking.clock_out_time = null;
      else if (addedEntry) DATA.attendance = DATA.attendance.filter(a => a !== addedEntry);
      silentSync();
    }
  },

  // ---- 사이드 공지 삭제: 기존 낙관적 패턴 그대로 유지 ----
  "del-notice": async (el) => {
    const id = el.dataset.id;
    const backup = DATA.sideNotices;
    DATA.sideNotices = DATA.sideNotices.filter(n => String(n.id) !== String(id));
    refreshTab();
    showToast("공지가 삭제되었습니다", "danger");
    try {
      await apiCall(`/notices/${id}`, "DELETE");
    } catch (e) {
      DATA.sideNotices = backup;
      refreshTab();
    }
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

  // ---- 팩션원 등록: 임시 항목을 즉시 목록에 추가, 서버 응답 오면 실제 값으로 교체 ----
  "submit-member": async () => {
    const name = document.getElementById("mName").value.trim();
    const badgeRaw = document.getElementById("mBadge").value.trim();
    const badge = formatBadge(badgeRaw);
    const rank = document.getElementById("mRank").value;
    if (!name || !badge) { showToast("이름과 고유번호를 입력하세요", "danger"); return; }

    const tempId = `temp_${Date.now()}`;
    DATA.accounts.push({
      id: tempId, name, badge, rank, status: "재직",
      username: "생성 중...", join_date: new Date().toISOString().slice(0, 10), permissions: []
    });
    document.getElementById("addMemberForm").style.display = "none";
    showToast(`${name} 팩션원 등록 처리 중`);
    refreshTab();

    try {
      const res = await apiCall("/members", "POST", { name, badge, rank });
      const idx = DATA.accounts.findIndex(a => a.id === tempId);
      if (idx !== -1) {
        DATA.accounts[idx] = { ...DATA.accounts[idx], id: res.id ?? tempId, username: res.username };
      }
      showToast(`${name} 팩션원 등록 완료 (초기 계정 ${res.username})`);
      refreshTab();
    } catch (e) {
      DATA.accounts = DATA.accounts.filter(a => a.id !== tempId);
      refreshTab();
    }
  },

  // ---- 재직/해임 토글: 로컬 즉시 반영 ----
  "toggle-status": async (el) => {
    const id = el.dataset.id;
    const acc = DATA.accounts.find(a => String(a.id) === String(id));
    const prevStatus = acc ? acc.status : null;
    if (acc) acc.status = acc.status === "재직" ? "해임" : "재직";
    showToast("상태가 변경되었습니다");
    refreshTab();

    try {
      await apiCall(`/members/${id}/status`, "PATCH");
    } catch (e) {
      if (acc && prevStatus) acc.status = prevStatus;
      refreshTab();
    }
  },

  "edit-badge": (el) => {
    EDIT_BADGE_ID = el.dataset.id;
    refreshMemberList();
  },
  "cancel-badge-edit": () => {
    EDIT_BADGE_ID = null;
    refreshMemberList();
  },
  "save-badge": async (el) => {
    const id = el.dataset.id;
    const input = document.getElementById(`badgeInput_${id}`);
    const newBadge = input ? input.value.trim() : "";
    if (!newBadge) { showToast("고유번호를 입력하세요", "danger"); return; }

    const acc = DATA.accounts.find(a => String(a.id) === String(id));
    const prevBadge = acc ? acc.badge : null;
    if (acc) acc.badge = newBadge;
    EDIT_BADGE_ID = null;
    showToast("고유번호가 변경되었습니다");
    refreshMemberList();

    try {
      await apiCall(`/members/${id}/badge`, "PATCH", { badge: newBadge });
    } catch (e) {
      if (acc && prevBadge !== null) acc.badge = prevBadge;
      refreshMemberList();
    }
  },

  // ---- 가입 신청 승인/반려: 대기 목록에서 즉시 제거 ----
  "decide-app": async (el) => {
    const id = el.dataset.id;
    const status = el.dataset.status;
    const backup = DATA.applications;
    DATA.applications = DATA.applications.map(a => String(a.id) === String(id) ? { ...a, status } : a);
    showToast(status === "승인" ? "승인 처리 중..." : "가입 신청을 반려했습니다", status === "승인" ? "ok" : "danger");
    refreshTab();

    try {
      const res = await apiCall(`/applications/${id}/decide`, "PATCH", { status });
      if (res.createdUser) {
        DATA.accounts.push(res.createdUser);
        showToast(`승인 완료 (아이디: ${res.createdUser.username}) · 신청자가 설정한 비밀번호로 로그인 가능합니다`, "ok");
        refreshTab();
      }
    } catch (e) {
      DATA.applications = backup;
      refreshTab();
    }
  },

  // ---- 내부경고 등록: 즉시 목록에 추가 ----
  "submit-warn": async () => {
    const targetSelect = document.getElementById("wTarget");
    const targetName = targetSelect.value.trim();
    const reason = document.getElementById("wReason").value.trim();
    const severity = document.getElementById("wSeverity").value;
    if (!targetName || !reason) { showToast("대상자와 사유를 입력하세요", "danger"); return; }

    const tempId = `temp_${Date.now()}`;
    DATA.warnings.push({
      id: tempId, target_name: targetName, reason, severity,
      date: new Date().toLocaleDateString('ko-KR'), issued_by: SESSION.name
    });
    document.getElementById("wReason").value = "";
    showToast("내부경고가 등록되었습니다");
    refreshTab();

    try {
      const res = await apiCall("/warnings", "POST", { targetName, reason, severity });
      if (res.warning) {
        const idx = DATA.warnings.findIndex(w => w.id === tempId);
        if (idx !== -1) DATA.warnings[idx] = res.warning;
        refreshTab();
      }
    } catch (e) {
      DATA.warnings = DATA.warnings.filter(w => w.id !== tempId);
      refreshTab();
    }
  },
  "remove-warn": async (el) => {
    const id = el.dataset.id;
    const backup = DATA.warnings;
    DATA.warnings = DATA.warnings.filter(w => String(w.id) !== String(id));
    refreshTab();
    showToast("삭제되었습니다", "danger");
    try {
      await apiCall(`/warnings/${id}`, "DELETE");
    } catch (e) {
      DATA.warnings = backup;
      refreshTab();
    }
  },

  "change-password": async (el) => {
    const id = el.dataset.id;
    const input = document.querySelector(`.pwInput[data-id="${id}"]`);
    const newPassword = input.value;
    if (!newPassword || newPassword.length < 6) { showToast("6자 이상 입력하세요", "danger"); return; }

    input.value = "";
    showToast("비밀번호가 변경되었습니다");

    try {
      await apiCall(`/members/${id}/password`, "PATCH", { newPassword });
    } catch (e) {
      showToast("비밀번호 변경에 실패했습니다. 다시 시도해주세요.", "danger");
    }
  },
  "remove-account": async (el) => {
    const id = el.dataset.id;
    const backup = DATA.accounts;
    DATA.accounts = DATA.accounts.filter(a => String(a.id) !== String(id));
    refreshTab();
    showToast("계정이 삭제되었습니다", "danger");
    try {
      await apiCall(`/members/${id}`, "DELETE");
    } catch (e) {
      DATA.accounts = backup;
      refreshTab();
    }
  },

  // ---- 웹훅 저장: 즉시 저장 처리 ----
  "save-webhook": async () => {
    const webhookUrl = document.getElementById("webhookUrl").value.trim();
    const rpWebhookUrl = document.getElementById("rpWebhookUrl").value.trim();
    const backup = { webhookUrl: DATA.webhookUrl, rpWebhookUrl: DATA.rpWebhookUrl };
    DATA.webhookUrl = webhookUrl;
    DATA.rpWebhookUrl = rpWebhookUrl;
    showToast("웹훅 주소가 저장되었습니다");

    try {
      await apiCall("/settings/webhook", "PATCH", { webhookUrl, rpWebhookUrl });
    } catch (e) {
      DATA.webhookUrl = backup.webhookUrl;
      DATA.rpWebhookUrl = backup.rpWebhookUrl;
      refreshTab();
    }
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

      await fetchFactionData(); // 로그인 직후는 최초 로드라 어쩔 수 없이 필요
      TAB = "dash";
      startPolling();
    } catch (e) {
      if (errEl) { errEl.textContent = e.message; errEl.style.display = "block"; }
    }
  },

  // ---- 사이드 공지 추가: 임시 항목을 즉시 목록 맨 위에 추가 ----
  "submit-notice": async () => {
    const titleInput = document.getElementById("snTitle");
    const contentInput = document.getElementById("snContent");
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title || !content) { showToast("제목과 내용을 모두 입력하세요", "danger"); return; }

    const tempId = `temp_${Date.now()}`;
    DATA.sideNotices.push({ id: tempId, title, content });
    titleInput.value = "";
    contentInput.value = "";
    showToast("공지가 추가되었습니다");
    refreshTab();

    try {
      const res = await apiCall("/notices", "POST", { title, content });
      const idx = DATA.sideNotices.findIndex(n => n.id === tempId);
      if (idx !== -1 && res.notice) DATA.sideNotices[idx] = res.notice;
      else if (idx !== -1 && res.id) DATA.sideNotices[idx].id = res.id;
      refreshTab();
    } catch (e) {
      DATA.sideNotices = DATA.sideNotices.filter(n => n.id !== tempId);
      refreshTab();
    }
  },

  // ---- RP 보고서: 즉시 목록에 추가 ----
  "submit-rp-report": async () => {
    const locationInput = document.getElementById("rpLocation");
    const targetInput = document.getElementById("rpTargetFaction");
    const resultInput = document.getElementById("rpResult");
    const contentInput = document.getElementById("rpContent");

    const location = locationInput.value.trim();
    const targetFaction = targetInput.value.trim();
    const result = resultInput.value.trim();
    const content = contentInput.value.trim();

    const tempId = `temp_${Date.now()}`;
    DATA.rpReports = DATA.rpReports || [];
    DATA.rpReports.unshift({
      id: tempId, user_id: SESSION.id, rank: SESSION.rank, name: SESSION.name, badge: SESSION.badge,
      location, target_faction: targetFaction, result, content, created_at: new Date().toISOString()
    });
    locationInput.value = ""; targetInput.value = ""; resultInput.value = ""; contentInput.value = "";
    showToast("RP 보고서가 디스코드로 전송되었습니다!", "ok");
    refreshTab();

    try {
      const res = await apiCall("/rp-reports", "POST", { location, targetFaction, result, content });
      if (res.report) {
        const idx = DATA.rpReports.findIndex(r => r.id === tempId);
        if (idx !== -1) DATA.rpReports[idx] = res.report;
        refreshTab();
      }
    } catch (e) {
      DATA.rpReports = DATA.rpReports.filter(r => r.id !== tempId);
      refreshTab();
    }
  }
};

const CHANGE_ACTIONS = {
  // ---- 계급 변경: 즉시 반영 ----
  "change-rank": async (el) => {
    const id = el.dataset.id;
    const newRank = el.value;
    const acc = DATA.accounts.find(a => String(a.id) === String(id));
    const prevRank = acc ? acc.rank : null;
    if (acc) acc.rank = newRank;
    showToast("계급이 변경되었습니다");
    refreshTab();

    try {
      await apiCall(`/members/${id}/rank`, "PATCH", { rank: newRank });
    } catch (e) {
      if (acc && prevRank) acc.rank = prevRank;
      refreshTab();
    }
  },

  // ---- 권한 체크박스: 즉시 반영 ----
  "toggle-permission": async (el) => {
    const id = el.dataset.id;
    const perm = el.dataset.perm;
    const isGranted = el.checked;
    const acc = DATA.accounts.find(a => String(a.id) === String(id));

    if (acc) {
      acc.permissions = acc.permissions || [];
      if (isGranted) { if (!acc.permissions.includes(perm)) acc.permissions.push(perm); }
      else { acc.permissions = acc.permissions.filter(p => p !== perm); }
    }
    showToast(`${isGranted ? '권한 부여됨' : '권한 해제됨'}`);

    try {
      await apiCall(`/members/${id}/permissions`, "PATCH", { permission: perm, granted: isGranted });
    } catch (e) {
      el.checked = !isGranted;
      if (acc) {
        if (!isGranted) { if (!acc.permissions.includes(perm)) acc.permissions.push(perm); }
        else { acc.permissions = acc.permissions.filter(p => p !== perm); }
      }
    }
  }
};
