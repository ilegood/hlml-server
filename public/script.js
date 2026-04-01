// 채널별 주제 설명 데이터
const TOPICS = {
  일반: "자유롭게 이야기를 나눠요",
  자유수다: "뭐든 얘기해요!",
  정보공유: "유용한 정보를 공유해요",
  개발잡담: "개발 이야기 환영",
  코드리뷰: "코드 리뷰 요청해요",
  짤방: "재미있는 짤 올려요",
};
// 이름 색상 변경 시 사용될 프리셋 색상들
const COLOR_PRESETS = [
  "#5865f2",
  "#3ba55c",
  "#ed4245",
  "#faa61a",
  "#7289da",
  "#00b0f4",
  "#eb459e",
  "#f47fff",
  "#ff7043",
  "#26c6da",
  "#66bb6a",
  "#ef5350",
];

// 전역 변수 설정
let socket,
  myName,
  myNameColor = "#5865f2",
  currentChannel = "일반";
let emojiOpen = false,
  typingTimer = null,
  typingUsers = new Set();
let pendingImage = null,
  replyTo = null;
let hosts = {};
let notifMuted = new Set();
let searchResults = [],
  searchIdx = 0;

// ── 채팅 참여 기능 ──
function joinChat() {
  const val = document.getElementById("username-input").value.trim();
  if (!val) return;
  myName = val;
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("my-uname").textContent = myName;
  buildColorPresets();

  socket = io(); // Socket.io 연결 시작
  socket.on("connect", () =>
    socket.emit("join", { username: myName, channel: currentChannel }),
  );

  // 서버로부터 채팅 내역 수신
  socket.on("history", ({ channel, messages }) => {
    if (channel !== currentChannel) return;
    const box = document.getElementById("messages");
    box.innerHTML = '<div class="date-sep">오늘</div>';
    messages.forEach((m) => appendMsg(m, false));
    box.scrollTop = box.scrollHeight;
  });

  // 새 메시지 수신
  socket.on("message", ({ channel, msg }) => {
    if (channel !== currentChannel) return;
    if (notifMuted.has(channel)) return;
    appendMsg(msg, true);
  });

  // 시스템 알림(입장/퇴장 등) 수신
  socket.on("system", ({ channel, text }) => {
    if (channel !== currentChannel) return;
    const d = document.createElement("div");
    d.className = "system-msg";
    d.textContent = text;
    document.getElementById("messages").appendChild(d);
    scrollBottom();
  });

  // 유저 목록 갱신 수신
  socket.on("users", (users) => {
    const me = users.find((u) => u.username === myName);
    if (me) {
      myNameColor = me.nameColor;
      document.getElementById("my-avatar").style.background = me.nameColor;
      document.getElementById("my-avatar").firstChild.textContent = myName
        .charAt(0)
        .toUpperCase();
    }
    renderMembers(users);
  });

  socket.on("serverHost", (host) => {
    serverHost = host;
    renderHostCrowns();
    renderMembers(lastUsers);
  });

  // 서버로부터 방 목록 수신
  socket.on("rooms", (rooms) => {
    renderRoomList(rooms);
  });

  // 이름 색상 업데이트 반영
  socket.on("nameColorUpdate", ({ username, color }) => {
    document
      .querySelectorAll(`[data-author="${CSS.escape(username)}"]`)
      .forEach((el) => (el.style.color = color));
  });

  // 메시지 수정 반영
  socket.on("editMessage", ({ channel, msgId, newText }) => {
    if (channel !== currentChannel) return;
    const el = document.querySelector(
      `[data-msgid="${CSS.escape(String(msgId))}"] .msg-text`,
    );
    if (!el) return;
    el.innerHTML = renderText(newText);
    const g = document.querySelector(
      `[data-msgid="${CSS.escape(String(msgId))}"]`,
    );
    if (g && !g.querySelector(".edited-tag")) {
      const t = document.createElement("span");
      t.className = "edited-tag";
      t.textContent = " (수정됨)";
      el.appendChild(t);
    }
  });

  // 메시지 삭제 반영
  socket.on("deleteMessage", ({ channel, msgId }) => {
    if (channel !== currentChannel) return;
    document
      .querySelector(`[data-msgid="${CSS.escape(String(msgId))}"]`)
      ?.remove();
  });

  // 리액션(이모지) 상태 반영
  socket.on("reaction", ({ channel, msgId, emoji, users }) => {
    if (channel !== currentChannel) return;
    const row = document.querySelector(
      `[data-msgid="${CSS.escape(String(msgId))}"] .reactions-row`,
    );
    if (!row) return;
    let btn = row.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
    if (users.length === 0) {
      btn?.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement("div");
      btn.className = "reaction";
      btn.dataset.emoji = emoji;
      btn.onclick = () =>
        socket.emit("reaction", {
          channel: currentChannel,
          msgId,
          emoji,
        });
      row.appendChild(btn);
    }
    btn.classList.toggle("mine", users.includes(myName));
    btn.innerHTML = `<span>${emoji}</span><span class="rc">${users.length}</span>`;
  });

  // 다른 유저가 타이핑 중임을 표시
  socket.on("typing", ({ username }) => {
    typingUsers.add(username);
    updateTyping();
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingUsers.delete(username);
      updateTyping();
    }, 2500);
  });

  // 추방되었을 때 처리
  socket.on("kicked", ({ channel, by }) => {
    alert(`${by}님에 의해 ${channel} 채널에서 추방되었습니다.`);
    // 로그인 화면으로 돌아가기
    document.getElementById("app").style.display = "none";
    document.getElementById("login-screen").style.display = "flex";
    // 소켓 연결 종료 및 채널 상태 초기화
    if (socket) socket.disconnect();
    currentChannel = "일반";
  });
}

// ── 메시지를 화면에 렌더링하는 함수 ──
function appendMsg(msg, scroll) {
  const box = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "msg-group";
  div.dataset.msgid = String(msg.id);

  const isHost = serverHost === msg.username;
  const isMe = msg.username === myName;
  const isHostMe = serverHost === myName;

  // 답장 정보가 있는 경우 상단바 렌더링
  let replyHtml = "";
  if (msg.replyTo) {
    replyHtml = `<div class="reply-preview" onclick="scrollToMsg('${CSS.escape(String(msg.replyTo.id))}')">
<span>↩</span><span class="reply-author" style="color:${escAttr(msg.replyTo.nameColor)}">${esc(msg.replyTo.username)}</span>
<span class="reply-text">${esc(msg.replyTo.text || "[이미지]")}</span></div>`;
  }

  // 이미지 처리
  const imageHtml = msg.image
    ? `<img class="msg-image" src="${msg.image}" alt="" onclick="openViewer(this.src)">`
    : "";
  // 수정 여부 표시
  const editedTag = msg.edited
    ? '<span class="edited-tag"> (수정됨)</span>'
    : "";
  const textHtml = msg.text
    ? `<div class="msg-text">${renderText(msg.text)}${editedTag}</div>`
    : "";

  const reactionsHtml = Object.entries(msg.reactions || {})
    .filter(([, u]) => u.length > 0)
    .map(
      ([
        e,
        u,
      ]) => `<div class="reaction ${u.includes(myName) ? "mine" : ""}" data-emoji="${CSS.escape(e)}"
onclick="socket.emit('reaction',{channel:'${currentChannel}',msgId:${JSON.stringify(msg.id)},emoji:'${e}'})">
<span>${e}</span><span class="rc">${u.length}</span></div>`,
    )
    .join("");

  // 본인 메시지인 경우 수정/삭제 버튼 노출
  const editBtn =
    isMe && msg.text
      ? `<button onclick="startEdit('${CSS.escape(String(msg.id))}','${escAttr(msg.text)}')" title="수정">✏️</button>`
      : "";
  const delBtn =
    isMe || isHostMe
      ? `<button onclick="deleteMsg('${CSS.escape(String(msg.id))}')" title="삭제">🗑</button>`
      : "";

  div.innerHTML = `
<div class="msg-actions">
${["😂", "👍", "❤️", "🔥"].map((e) => `<button onclick="socket.emit('reaction',{channel:'${currentChannel}',msgId:${JSON.stringify(msg.id)},emoji:'${e}'})">${e}</button>`).join("")}
<button onclick="setReply(${JSON.stringify(msg)})" title="답장">↩</button>
${editBtn}${delBtn}
</div>
<div class="msg-avatar" style="background:${escAttr(msg.nameColor)}">${esc(msg.username.charAt(0).toUpperCase())}</div>
<div class="msg-body">
${replyHtml}
<div class="msg-header">
  <span class="msg-author" data-author="${escAttr(msg.username)}" style="color:${escAttr(msg.nameColor)}">${esc(msg.username)}</span>
  ${isHost ? '<span class="host-crown" title="서버 방장">👑</span>' : ""}
  <span class="msg-time">${msg.time}</span>
</div>
${textHtml}${imageHtml}
<div class="reactions-row">${reactionsHtml}</div>
</div>`;
  box.appendChild(div);
  if (scroll) scrollBottom();
}

// 특수 문자 처리 (XSS 방지) 및 마크다운(코드, 멘션) 처리
function renderText(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/@(\S+)/g, (m, n) => {
      const cls = n === myName ? "mention me" : "mention";
      return `<span class="${cls}">@${esc(n)}</span>`;
    });
}

// 방장 👑 표시 갱신
function renderHostCrowns() {
  document.querySelectorAll(".host-crown").forEach((el) => {
    const author = el.closest(".msg-body")?.querySelector(".msg-author")
      ?.dataset.author;
    el.style.display = author && serverHost === author ? "" : "none";
  });
}

// 오른쪽 방 목록 렌더링
function renderRoomList(rooms) {
  const container = document.getElementById("room-list-container");
  if (!container) return;
  container.innerHTML = "";
  rooms.forEach((room) => {
    const el = document.createElement("div");
    el.className = `room-item ${currentChannel === room ? "active" : ""}`;
    el.innerHTML = `<span class="room-hash">#</span> <span class="room-name">${esc(room)}</span>`;
    el.onclick = () => {
      // 모든 room-item에서 active 제거
      document
        .querySelectorAll(".room-item")
        .forEach((r) => r.classList.remove("active"));
      el.classList.add("active");

      // 채널 이동 로직 (기존 함수 재사용)
      const sidebarItem = Array.from(
        document.querySelectorAll(".ch-item"),
      ).find((i) => i.textContent.includes(room));
      switchChannel(room, sidebarItem);
    };
    container.appendChild(el);
  });
}

let lastUsers = [];
// 오른쪽 사이드바 멤버 목록 렌더링
function renderMembers(users) {
  lastUsers = users;
  const div = document.getElementById("members-online");
  div.innerHTML = "";
  const isHostMe = serverHost === myName;
  users.forEach((u) => {
    const el = document.createElement("div");
    el.className = "mem-item";
    const kickBtn =
      isHostMe && u.username !== myName
        ? `<button class="kick-btn" onclick="kickUser('${escAttr(u.username)}')">추방</button>`
        : "";
    const isH = serverHost === u.username;
    el.innerHTML = `
<div class="mem-avatar" style="background:${escAttr(u.nameColor)}">
  ${esc(u.username.charAt(0).toUpperCase())}
  <div class="mem-status-dot ${u.online ? "" : "offline"}"></div>
</div>
<span class="mem-name" style="color:${escAttr(u.nameColor)}">${esc(u.username)}</span>
${isH ? '<span class="mem-crown">👑</span>' : ""}
${kickBtn}`;
    div.appendChild(el);
  });
  document.getElementById("online-label").textContent =
    `온라인 — ${users.length}`;
}

// ── 메시지 전송 기능 ──
function sendMsg() {
  if (!socket) return;
  // 이미지가 준비된 경우 이미지 전송
  if (pendingImage) {
    socket.emit("image", {
      channel: currentChannel,
      dataUrl: pendingImage.dataUrl,
      filename: pendingImage.filename,
      replyTo: replyTo,
    });
    cancelPaste();
    cancelReply();
    return;
  }
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("message", { channel: currentChannel, text, replyTo });
  input.value = "";
  cancelReply();
}

// 엔터키 입력 시 메시지 전송
function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) sendMsg();
}

// ── 답장 설정 ──
function setReply(msg) {
  replyTo = msg;
  document.getElementById("rb-author").textContent = msg.username;
  document.getElementById("rb-text").textContent = msg.text || "[이미지]";
  document.getElementById("reply-bar").classList.add("active");
  document.getElementById("msg-input").focus();
}
function cancelReply() {
  replyTo = null;
  document.getElementById("reply-bar").classList.remove("active");
}
// 답장 클릭 시 해당 메시지로 스크롤 이동 및 강조
function scrollToMsg(id) {
  const el = document.querySelector(`[data-msgid="${id}"]`);
  if (!el) return;
  el.classList.add("highlight");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => el.classList.remove("highlight"), 1500);
}

// ── 메시지 수정/삭제 기능 ──
function startEdit(escapedId, text) {
  const id = escapedId;
  const group = document.querySelector(`[data-msgid="${CSS.escape(id)}"]`);
  if (!group) return;
  const body = group.querySelector(".msg-body");
  const oldText = group.querySelector(".msg-text");
  if (oldText) oldText.style.display = "none";
  if (body.querySelector(".edit-input")) return;
  const inp = document.createElement("input");
  inp.className = "edit-input";
  inp.value = text;
  const hint = document.createElement("div");
  hint.className = "edit-hint";
  hint.textContent = "Enter 저장 · Esc 취소";
  body.appendChild(inp);
  body.appendChild(hint);
  inp.focus();
  inp.onkeydown = (e) => {
    if (e.key === "Enter") {
      const newText = inp.value.trim();
      if (newText)
        socket.emit("editMessage", {
          channel: currentChannel,
          msgId: id,
          newText,
        });
      inp.remove();
      hint.remove();
      if (oldText) oldText.style.display = "";
    } else if (e.key === "Escape") {
      inp.remove();
      hint.remove();
      if (oldText) oldText.style.display = "";
    }
  };
}
function deleteMsg(escapedId) {
  const id = escapedId;
  if (!confirm("메시지를 삭제할까요?")) return;
  socket.emit("deleteMessage", { channel: currentChannel, msgId: id });
}

// ── 추방 기능 (방장용) ──
function kickUser(username) {
  if (!confirm(`${username}님을 추방할까요?`)) return;
  socket.emit("kickUser", { username, channel: currentChannel });
}

// ── 채널 전환 기능 ──
function switchChannel(ch, el) {
  currentChannel = ch;
  document
    .querySelectorAll(".ch-item")
    .forEach((i) => i.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("ch-title").textContent = ch;
  document.getElementById("ch-topic").textContent = TOPICS[ch] || "";
  document.getElementById("msg-input").placeholder =
    `#${ch} 에서 메시지 보내기`;
  document.getElementById("messages").innerHTML =
    '<div class="date-sep">오늘</div>';
  socket.emit("switchChannel", ch);
  closeSearch();
}

// ── 메시지 검색 기능 ──
function toggleSearch() {
  const bar = document.getElementById("search-bar");
  bar.classList.toggle("open");
  if (bar.classList.contains("open"))
    document.getElementById("search-input").focus();
  else closeSearch();
}
function closeSearch() {
  document.getElementById("search-bar").classList.remove("open");
  document.getElementById("search-input").value = "";
  document.querySelectorAll(".search-hl").forEach((el) => {
    el.outerHTML = el.textContent;
  });
  searchResults = [];
  searchIdx = 0;
  document.getElementById("search-count").textContent = "";
}
function doSearch() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  document.querySelectorAll(".search-hl").forEach((el) => {
    el.outerHTML = el.textContent;
  });
  searchResults = [];
  if (!q) {
    document.getElementById("search-count").textContent = "";
    return;
  }
  const groups = document.querySelectorAll(".msg-group");
  groups.forEach((g) => {
    const txt = g.querySelector(".msg-text");
    if (!txt) return;
    const orig = txt.textContent.toLowerCase();
    if (orig.includes(q)) searchResults.push(g);
  });
  document.getElementById("search-count").textContent = searchResults.length
    ? `${searchResults.length}개`
    : "없음";
  if (searchResults.length) {
    searchIdx = 0;
    highlightAndScroll();
  }
}
function searchKey(e) {
  if (e.key === "Enter") {
    if (!searchResults.length) return;
    searchIdx = (searchIdx + 1) % searchResults.length;
    highlightAndScroll();
  }
}
function highlightAndScroll() {
  const g = searchResults[searchIdx];
  if (!g) return;
  g.scrollIntoView({ behavior: "smooth", block: "center" });
  g.classList.add("highlight");
  setTimeout(() => g.classList.remove("highlight"), 1200);
}

// ── 알림 켜기/끄기 기능 ──
function toggleNotif() {
  const btn = document.getElementById("notif-btn");
  if (notifMuted.has(currentChannel)) {
    notifMuted.delete(currentChannel);
    btn.textContent = "🔔";
  } else {
    notifMuted.add(currentChannel);
    btn.textContent = "🔕";
  }
}

// ── 멤버 목록 보이기/숨기기 ──
function toggleMemberList() {
  const ml = document.getElementById("member-list");
  ml.style.display = ml.style.display === "none" ? "" : "none";
}

// ── 이름 색상 선택기 기능 ──
function buildColorPresets() {
  const cont = document.getElementById("color-presets");
  cont.innerHTML = "";
  COLOR_PRESETS.forEach((c) => {
    const d = document.createElement("div");
    d.className = "color-preset";
    d.style.background = c;
    d.onclick = () => {
      document.getElementById("custom-color").value = c;
      document
        .querySelectorAll(".color-preset")
        .forEach((p) => p.classList.remove("sel"));
      d.classList.add("sel");
    };
    cont.appendChild(d);
  });
}
function openColorModal() {
  document.getElementById("color-modal").classList.add("active");
}
function closeColorModal() {
  document.getElementById("color-modal").classList.remove("active");
}
function applyColor() {
  const color = document.getElementById("custom-color").value;
  myNameColor = color;
  socket.emit("changeNameColor", { color });
  closeColorModal();
}

// ── 이미지 파일 처리 기능 ──
function processImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > 8 * 1024 * 1024) {
    alert("8MB 이하만 가능해요!");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingImage = { dataUrl: e.target.result, filename: file.name };
    document.getElementById("preview-img").src = e.target.result;
    document.getElementById("preview-info").textContent =
      `${file.name} (${(file.size / 1024).toFixed(0)}KB)`;
    document.getElementById("paste-preview").classList.add("active");
    document.getElementById("msg-input").focus();
  };
  reader.readAsDataURL(file);
}
function cancelPaste() {
  pendingImage = null;
  document.getElementById("paste-preview").classList.remove("active");
  document.getElementById("preview-img").src = "";
  document.getElementById("file-input").value = "";
}
function handleFileSelect(e) {
  processImageFile(e.target.files[0]);
}

// 드래그 앤 드롭으로 이미지 업로드 처리
document.addEventListener("DOMContentLoaded", () => {
  const chatMain = document.getElementById("chat-main");
  if (chatMain) {
    let dragC = 0;
    chatMain.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragC++;
      document.getElementById("drop-overlay").classList.add("active");
    });
    chatMain.addEventListener("dragleave", () => {
      dragC--;
      if (dragC <= 0) {
        dragC = 0;
        document.getElementById("drop-overlay").classList.remove("active");
      }
    });
    chatMain.addEventListener("dragover", (e) => e.preventDefault());
    chatMain.addEventListener("drop", (e) => {
      e.preventDefault();
      dragC = 0;
      document.getElementById("drop-overlay").classList.remove("active");
      processImageFile(e.dataTransfer.files[0]);
    });
  }

  // ── 사이드바 크기 조절 로직 ──
  function initResizer(resizerId, targetId, isRightSide) {
    const resizer = document.getElementById(resizerId);
    const target = document.getElementById(targetId);

    if (!resizer || !target) return;

    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = target.offsetWidth;

      function onMouseMove(e) {
        let delta = e.clientX - startX;
        let newWidth;

        // 오른쪽 바는 마우스가 왼쪽으로 갈수록 너비가 넓어짐
        if (isRightSide) {
          newWidth = startWidth - delta;
        } else {
          newWidth = startWidth + delta;
        }

        // 최소 너비 160px, 최대 너비 500px 제한
        if (newWidth >= 160 && newWidth <= 500) {
          target.style.width = newWidth + "px";
          target.style.flexBasis = newWidth + "px"; // Flex 레이아웃 대응
        }
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        resizer.classList.remove("active");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      resizer.classList.add("active");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });
  }

  // 왼쪽 커뮤니티 바 조절
  initResizer("ch-resizer", "ch-sidebar", false);
  // 오른쪽 온라인 바 조절
  initResizer("mem-resizer", "member-list", true);
});

// 클립보드 이미지 붙여넣기 처리
document.addEventListener("paste", (e) => {
  if (document.getElementById("app").style.display === "none") return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      processImageFile(item.getAsFile());
      break;
    }
  }
});

// 이미지 크게 보기(뷰어) 기능
function openViewer(src) {
  document.getElementById("viewer-img").src = src;
  document.getElementById("img-viewer").classList.add("active");
}
function closeViewer() {
  document.getElementById("img-viewer").classList.remove("active");
}

// ── 타이핑 중 표시 처리 ──
function onTyping() {
  if (!socket) return;
  socket.emit("typing", { channel: currentChannel });
}
function updateTyping() {
  const el = document.getElementById("typing-indicator");
  const others = [...typingUsers].filter((u) => u !== myName);
  el.textContent =
    others.length === 0
      ? ""
      : others.length === 1
        ? `${others[0]}님이 입력 중...`
        : `${others.slice(0, -1).join(", ")}, ${others.at(-1)}님이 입력 중...`;
}

// ── 이모지 선택기 기능 ──
function toggleEmoji() {
  emojiOpen = !emojiOpen;
  document.getElementById("emoji-picker").style.display = emojiOpen
    ? "block"
    : "none";
}
function ins(e) {
  const i = document.getElementById("msg-input");
  i.value += e;
  i.focus();
}

// ── 유틸리티 함수 (스크롤 제어, 이스케이프) ──
function scrollBottom() {
  const b = document.getElementById("messages");
  b.scrollTop = b.scrollHeight;
}
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escAttr(s) {
  return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── 가시성 감지 (화면을 내리면 오프라인 처리) ──
document.addEventListener("visibilitychange", () => {
  if (socket && socket.connected) {
    socket.emit("updateStatus", document.visibilityState === "visible");
  }
});

// 닉네임 입력 후 엔터 누르면 입장
document.getElementById("username-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinChat();
});
