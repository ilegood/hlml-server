// ============================================================
//  할래말래 — script.js
//  기능: 글쓰기/수정/삭제, 이미지 드래그 등록/수정,
//        좋아요, 참여하기, 댓글, 대댓글, 댓글수정, "수정됨" 표시
// ============================================================

const CATEGORY_MAP = {
  성별: ["남성", "여성", "혼성"],
  나이: ["10대", "20대", "30대", "40대", "50대 이상"],
  흡연: ["흡연자", "비흡연자"],
  음주: ["음주", "금주"],
  활동: ["식사", "운동", "수다", "게임", "산책", "창작", "휴식", "기타"],
};

// ── 스토리지 ──────────────────────────────────────────────
function loadData() {
  return JSON.parse(localStorage.getItem("posts") || "[]");
}
function saveData(data) {
  localStorage.setItem("posts", JSON.stringify(data));
}

// ── 유틸 ──────────────────────────────────────────────────
function getTimeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  return `${day}일 전`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── 이미지 파일 → base64 ──────────────────────────────────
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target.result);
    r.onerror = () => rej(new Error("읽기 실패"));
    r.readAsDataURL(file);
  });
}

// ── 드래그 앤 드롭 이미지 바인딩 ─────────────────────────
//  zone     : .drop-zone 엘리먼트
//  fileInput: <input type=file>
//  onImage  : (base64) => void
function bindImageDrop(zone, fileInput, onImage) {
  // 클릭 → 파일 선택
  zone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    onImage(b64);
  });

  // 드래그 스타일
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", async (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const b64 = await fileToBase64(file);
    onImage(b64);
  });
}

// ── 카테고리 렌더 ─────────────────────────────────────────
function renderCategories(container, selected, onChange) {
  container.innerHTML = "";
  const row = document.createElement("div");
  row.className = "category-row";

  Object.entries(CATEGORY_MAP).forEach(([cat, opts]) => {
    const wrap = document.createElement("div");
    wrap.className = "category-wrapper";

    const title = document.createElement("div");
    title.className =
      "category-title" + (selected[cat] ? " has-selection" : "");
    title.innerHTML = selected[cat]
      ? `<span class="selected-dot"></span>${escHtml(selected[cat])}`
      : escHtml(cat);

    const dropdown = document.createElement("div");
    dropdown.className = "category-dropdown";

    title.onclick = (e) => {
      e.stopPropagation();
      document
        .querySelectorAll(".category-dropdown")
        .forEach((el) => (el.style.display = "none"));
      dropdown.style.display =
        dropdown.style.display === "block" ? "none" : "block";
    };

    opts.forEach((opt) => {
      const btn = document.createElement("div");
      btn.className = "tag-btn" + (selected[cat] === opt ? " active" : "");
      btn.textContent = opt;
      btn.onclick = (e) => {
        e.stopPropagation();
        selected[cat] = selected[cat] === opt ? null : opt;
        onChange();
        dropdown.style.display = "none";
      };
      dropdown.appendChild(btn);
    });

    wrap.appendChild(title);
    wrap.appendChild(dropdown);
    row.appendChild(wrap);
  });

  container.appendChild(row);
  document.addEventListener("click", () => {
    document
      .querySelectorAll(".category-dropdown")
      .forEach((el) => (el.style.display = "none"));
  });
}

// ============================================================
//  글쓰기 페이지
// ============================================================
if (document.getElementById("addBtn")) {
  const titleInput = document.getElementById("titleInput");
  const contentInput = document.getElementById("contentInput");
  const imageInput = document.getElementById("imageInput");
  const dropZone = document.getElementById("dropZone");
  const imagePreview = document.getElementById("imagePreview");
  const previewImg = document.getElementById("previewImg");
  const removeImgBtn = document.getElementById("removeImgBtn");
  const writeTags = document.getElementById("writeTags");
  const addBtn = document.getElementById("addBtn");

  let selectedCategories = {};
  let imageData = "";

  function showPreview(b64) {
    imageData = b64;
    previewImg.src = b64;
    imagePreview.style.display = "block";
    dropZone.style.display = "none";
  }

  function clearPreview() {
    imageData = "";
    imageInput.value = "";
    imagePreview.style.display = "none";
    dropZone.style.display = "flex";
  }

  bindImageDrop(dropZone, imageInput, showPreview);
  removeImgBtn.onclick = clearPreview;

  function refresh() {
    renderCategories(writeTags, selectedCategories, refresh);
  }
  refresh();

  addBtn.onclick = () => {
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title || !content) {
      alert("제목과 내용을 입력해주세요!");
      return;
    }

    const data = loadData();
    data.push({
      id: Date.now(),
      title,
      content,
      categories: { ...selectedCategories },
      image: imageData,
      createdAt: Date.now(),
      edited: false,
      likes: 0,
      likedBy: [],
      participants: 0,
      joinedBy: [],
      comments: [],
    });
    saveData(data);
    location.href = "index.html";
  };
}

// ============================================================
//  메인 페이지
// ============================================================
if (document.getElementById("cardList")) {
  const cardList = document.getElementById("cardList");
  const searchInput = document.getElementById("searchInput");
  const tagFilters = document.getElementById("tagFilters");
  let selectedCategories = {};

  function renderCards(list) {
    cardList.innerHTML = "";
    const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
    if (sorted.length === 0) {
      cardList.innerHTML = `<div class="empty-state">
        <div class="empty-icon">🙈</div>
        <p>아직 게시글이 없어요</p>
        <span>첫 번째 글을 작성해보세요!</span>
      </div>`;
      return;
    }
    sorted.forEach((item, i) => {
      const div = document.createElement("div");
      div.className = "card";
      div.style.animationDelay = `${i * 0.04}s`;

      const tags = Object.entries(item.categories || {})
        .filter(([, v]) => v)
        .map(([, v]) => `<span class="tag">${escHtml(v)}</span>`)
        .join("");

      const liked = (item.likedBy || []).includes("me");
      const joined = (item.joinedBy || []).includes("me");
      const totalComments = countComments(item.comments || []);

      div.innerHTML = `
        <div class="card-inner" onclick="location.href='detail.html?id=${item.id}'">
          ${
            item.image
              ? `<div class="card-img-wrap"><img src="${item.image}" class="card-img" alt=""></div>`
              : ""
          }
          <div class="card-body">
            <div class="card-header-row">
              ${item.edited ? '<span class="edited-badge">수정됨</span>' : ""}
              <span class="card-time">${getTimeAgo(item.createdAt)}</span>
            </div>
            <div class="card-title">${escHtml(item.title)}</div>
            <div class="card-content">${escHtml(item.content)}</div>
            ${tags ? `<div class="card-tags">${tags}</div>` : ""}
          </div>
        </div>
        <div class="card-footer">
          <button class="action-btn ${liked ? "liked-btn" : ""}" onclick="event.stopPropagation();toggleLikeCard(${item.id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="${liked ? "#ff4757" : "none"}" stroke="${liked ? "#ff4757" : "currentColor"}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            ${item.likes || 0}
          </button>
          <button class="action-btn ${joined ? "joined-btn" : ""}" onclick="event.stopPropagation();toggleJoinCard(${item.id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${item.participants || 0}명 참여
          </button>
          <span class="comment-count">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${totalComments}
          </span>
        </div>`;
      cardList.appendChild(div);
    });
  }

  function applyFilters() {
    const data = loadData();
    const keyword = searchInput.value.toLowerCase();
    const result = data.filter((item) => {
      const matchText =
        item.title.toLowerCase().includes(keyword) ||
        item.content.toLowerCase().includes(keyword);
      const matchCat = Object.entries(selectedCategories).every(
        ([k, v]) => !v || item.categories?.[k] === v,
      );
      return matchText && matchCat;
    });
    renderCards(result);
  }

  window.toggleLikeCard = (id) => {
    const data = loadData();
    const post = data.find((p) => p.id === id);
    if (!post) return;
    post.likedBy = post.likedBy || [];
    const i = post.likedBy.indexOf("me");
    if (i === -1) {
      post.likedBy.push("me");
      post.likes = (post.likes || 0) + 1;
    } else {
      post.likedBy.splice(i, 1);
      post.likes = Math.max(0, (post.likes || 1) - 1);
    }
    saveData(data);
    applyFilters();
  };

  window.toggleJoinCard = (id) => {
    const data = loadData();
    const post = data.find((p) => p.id === id);
    if (!post) return;
    post.joinedBy = post.joinedBy || [];
    const i = post.joinedBy.indexOf("me");
    if (i === -1) {
      post.joinedBy.push("me");
      post.participants = (post.participants || 0) + 1;
    } else {
      post.joinedBy.splice(i, 1);
      post.participants = Math.max(0, (post.participants || 1) - 1);
    }
    saveData(data);
    applyFilters();
  };

  searchInput.oninput = applyFilters;
  renderCategories(tagFilters, selectedCategories, applyFilters);
  applyFilters();
}

// ============================================================
//  상세 페이지
// ============================================================
if (document.getElementById("detailPage")) {
  const params = new URLSearchParams(location.search);
  const id = Number(params.get("id"));
  const container = document.getElementById("detailPage");
  const commentSection = document.getElementById("commentSection");
  const commentListEl = document.getElementById("commentList");
  const commentInput = document.getElementById("commentInput");
  const commentSubmit = document.getElementById("commentSubmit");
  const headerActions = document.getElementById("headerActions");
  const commentCountBadge = document.getElementById("commentCountBadge");

  // 댓글 수정 모달 관련
  const commentEditModal = document.getElementById("commentEditModal");
  const commentEditInput = document.getElementById("commentEditInput");
  const commentEditCancel = document.getElementById("commentEditCancel");
  const commentEditSave = document.getElementById("commentEditSave");
  let editingCommentPath = null; // { commentIdx, replyIdx? }

  // 게시글 수정 모달 관련
  const editModal = document.getElementById("editModal");
  const editCancel = document.getElementById("editCancel");
  const editSave = document.getElementById("editSave");
  const editDropZone = document.getElementById("editDropZone");
  const editImageInput = document.getElementById("editImageInput");
  const editImagePreview = document.getElementById("editImagePreview");
  const editPreviewImg = document.getElementById("editPreviewImg");
  const editRemoveImgBtn = document.getElementById("editRemoveImgBtn");
  let editImageData = "";

  function getData() {
    return loadData();
  }
  function getPost() {
    return getData().find((p) => p.id === id);
  }

  // ── 댓글 총 개수 (대댓글 포함) ──
  function countAll(comments) {
    return countComments(comments);
  }

  // ── 헤더 수정/삭제 버튼 ──
  headerActions.innerHTML = `
    <div class="more-menu-wrap">
      <button class="more-btn" id="moreBtn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      </button>
      <div class="more-menu" id="moreMenu" style="display:none;">
        <div class="more-item" id="editBtn">수정</div>
        <div class="more-item delete" id="deleteBtn">삭제</div>
      </div>
    </div>`;

  document.getElementById("moreBtn").onclick = (e) => {
    e.stopPropagation();
    const m = document.getElementById("moreMenu");
    m.style.display = m.style.display === "block" ? "none" : "block";
  };
  document.addEventListener("click", () => {
    const m = document.getElementById("moreMenu");
    if (m) m.style.display = "none";
  });

  document.getElementById("deleteBtn").onclick = () => {
    if (!confirm("정말 삭제할까요?")) return;
    saveData(getData().filter((p) => p.id !== id));
    location.href = "index.html";
  };

  // ── 게시글 수정 모달 열기 ──
  document.getElementById("editBtn").onclick = () => {
    const post = getPost();
    if (!post) return;
    document.getElementById("editTitle").value = post.title;
    document.getElementById("editContent").value = post.content;

    // 기존 이미지 표시
    editImageData = post.image || "";
    if (editImageData) {
      editPreviewImg.src = editImageData;
      editImagePreview.style.display = "block";
      editDropZone.style.display = "none";
    } else {
      editImagePreview.style.display = "none";
      editDropZone.style.display = "flex";
    }
    editModal.style.display = "flex";
    document.getElementById("moreMenu").style.display = "none";
  };
  editCancel.onclick = () => {
    editModal.style.display = "none";
  };

  // 수정 모달 드래그 앤 드롭
  bindImageDrop(editDropZone, editImageInput, (b64) => {
    editImageData = b64;
    editPreviewImg.src = b64;
    editImagePreview.style.display = "block";
    editDropZone.style.display = "none";
  });
  editRemoveImgBtn.onclick = () => {
    editImageData = "";
    editImageInput.value = "";
    editImagePreview.style.display = "none";
    editDropZone.style.display = "flex";
  };

  editSave.onclick = () => {
    const newTitle = document.getElementById("editTitle").value.trim();
    const newContent = document.getElementById("editContent").value.trim();
    if (!newTitle || !newContent) {
      alert("제목과 내용을 입력해주세요!");
      return;
    }

    const data = getData();
    const idx = data.findIndex((p) => p.id === id);
    if (idx === -1) return;
    data[idx].title = newTitle;
    data[idx].content = newContent;
    data[idx].image = editImageData;
    data[idx].edited = true;
    saveData(data);
    editModal.style.display = "none";
    renderDetail();
  };

  // ── 댓글 수정 모달 ──
  commentEditCancel.onclick = () => {
    commentEditModal.style.display = "none";
    editingCommentPath = null;
  };
  commentEditSave.onclick = () => {
    const newText = commentEditInput.value.trim();
    if (!newText) {
      alert("내용을 입력해주세요!");
      return;
    }
    if (!editingCommentPath) return;

    const data = getData();
    const post = data.find((p) => p.id === id);
    if (!post) return;

    const { commentIdx, replyIdx } = editingCommentPath;
    if (replyIdx !== undefined) {
      post.comments[commentIdx].replies[replyIdx].text = newText;
      post.comments[commentIdx].replies[replyIdx].edited = true;
    } else {
      post.comments[commentIdx].text = newText;
      post.comments[commentIdx].edited = true;
    }
    saveData(data);
    commentEditModal.style.display = "none";
    editingCommentPath = null;
    renderComments();
  };

  // ── 상세 렌더 ──────────────────────────────────────────
  function renderDetail() {
    const post = getPost();
    if (!post) {
      container.innerHTML = `<div class="empty-state"><p>게시글을 찾을 수 없어요</p></div>`;
      return;
    }

    const liked = (post.likedBy || []).includes("me");
    const joined = (post.joinedBy || []).includes("me");
    const tags = Object.entries(post.categories || {})
      .filter(([, v]) => v)
      .map(([, v]) => `<span class="tag">${escHtml(v)}</span>`)
      .join("");

    container.innerHTML = `
      ${post.image ? `<img src="${post.image}" class="detail-img" alt="">` : ""}
      <div class="detail-body">
        ${tags ? `<div class="card-tags" style="margin-bottom:10px;">${tags}</div>` : ""}
        <div class="detail-title-row">
          <h2 class="detail-title">${escHtml(post.title)}</h2>
          ${post.edited ? '<span class="edited-badge">수정됨</span>' : ""}
        </div>
        <p class="detail-content">${escHtml(post.content)}</p>
        <div class="detail-time">${new Date(post.createdAt).toLocaleString("ko-KR")}</div>
        <div class="detail-actions">
          <button class="action-btn-lg ${liked ? "liked" : ""}" id="likeBtn">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="${liked ? "#ff4757" : "none"}" stroke="${liked ? "#ff4757" : "currentColor"}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            좋아요 <span>${post.likes || 0}</span>
          </button>
          <button class="action-btn-lg ${joined ? "joined" : ""}" id="joinBtn">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${joined ? "참여중" : "참여하기"} <span>${post.participants || 0}명</span>
          </button>
        </div>
      </div>`;

    document.getElementById("likeBtn").onclick = () => {
      const data = getData();
      const p = data.find((x) => x.id === id);
      p.likedBy = p.likedBy || [];
      const i = p.likedBy.indexOf("me");
      if (i === -1) {
        p.likedBy.push("me");
        p.likes = (p.likes || 0) + 1;
      } else {
        p.likedBy.splice(i, 1);
        p.likes = Math.max(0, (p.likes || 1) - 1);
      }
      saveData(data);
      renderDetail();
    };
    document.getElementById("joinBtn").onclick = () => {
      const data = getData();
      const p = data.find((x) => x.id === id);
      p.joinedBy = p.joinedBy || [];
      const i = p.joinedBy.indexOf("me");
      if (i === -1) {
        p.joinedBy.push("me");
        p.participants = (p.participants || 0) + 1;
      } else {
        p.joinedBy.splice(i, 1);
        p.participants = Math.max(0, (p.participants || 1) - 1);
      }
      saveData(data);
      renderDetail();
    };
  }

  // ── 댓글/대댓글 렌더 ────────────────────────────────────
  function renderComments() {
    const post = getPost();
    if (!post) return;
    const comments = post.comments || [];
    const total = countComments(comments);

    commentSection.style.display = "block";
    commentCountBadge.textContent = total;
    commentListEl.innerHTML = "";

    if (comments.length === 0) {
      commentListEl.innerHTML = `<div class="no-comment">첫 댓글을 남겨보세요 👋</div>`;
      return;
    }

    comments.forEach((c, ci) => {
      // ── 댓글 아이템 ──
      const cDiv = document.createElement("div");
      cDiv.className = "comment-item";
      cDiv.innerHTML = `
        <div class="comment-bubble">
          <div class="comment-top">
            <span class="comment-author">익명</span>
            ${c.edited ? '<span class="edited-badge sm">수정됨</span>' : ""}
            <span class="comment-time">${getTimeAgo(c.createdAt)}</span>
          </div>
          <div class="comment-text">${escHtml(c.text)}</div>
          <div class="comment-actions">
            <button class="cmt-act-btn reply-toggle-btn" data-ci="${ci}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              답글
            </button>
            <button class="cmt-act-btn" onclick="openCommentEdit(${ci})">수정</button>
            <button class="cmt-act-btn danger" onclick="deleteComment(${ci})">삭제</button>
          </div>
        </div>`;

      // ── 대댓글 목록 ──
      const repliesWrap = document.createElement("div");
      repliesWrap.className = "replies-wrap";
      (c.replies || []).forEach((r, ri) => {
        const rDiv = document.createElement("div");
        rDiv.className = "comment-item reply-item";
        rDiv.innerHTML = `
          <div class="reply-arrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          </div>
          <div class="comment-bubble">
            <div class="comment-top">
              <span class="comment-author">익명</span>
              ${r.edited ? '<span class="edited-badge sm">수정됨</span>' : ""}
              <span class="comment-time">${getTimeAgo(r.createdAt)}</span>
            </div>
            <div class="comment-text">${escHtml(r.text)}</div>
            <div class="comment-actions">
              <button class="cmt-act-btn" onclick="openReplyEdit(${ci},${ri})">수정</button>
              <button class="cmt-act-btn danger" onclick="deleteReply(${ci},${ri})">삭제</button>
            </div>
          </div>`;
        repliesWrap.appendChild(rDiv);
      });

      // ── 답글 입력창 ──
      const replyInputWrap = document.createElement("div");
      replyInputWrap.className = "reply-input-wrap";
      replyInputWrap.style.display = "none";
      replyInputWrap.innerHTML = `
        <div class="reply-arrow">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
        </div>
        <div class="reply-input-inner">
          <input class="comment-input reply-input" placeholder="답글을 입력하세요..." />
          <button class="comment-submit reply-submit">등록</button>
        </div>`;

      // 답글 토글
      cDiv.querySelector(".reply-toggle-btn").onclick = () => {
        const isOpen = replyInputWrap.style.display !== "none";
        // 모든 답글창 닫기
        document
          .querySelectorAll(".reply-input-wrap")
          .forEach((el) => (el.style.display = "none"));
        if (!isOpen) {
          replyInputWrap.style.display = "flex";
          replyInputWrap.querySelector(".reply-input").focus();
        }
      };

      // 답글 등록
      const replyInput = replyInputWrap.querySelector(".reply-input");
      const replySubmit = replyInputWrap.querySelector(".reply-submit");

      const submitReply = () => {
        const text = replyInput.value.trim();
        if (!text) return;
        const data = getData();
        const p = data.find((x) => x.id === id);
        p.comments[ci].replies = p.comments[ci].replies || [];
        p.comments[ci].replies.push({
          text,
          createdAt: Date.now(),
          edited: false,
        });
        saveData(data);
        renderComments();
      };
      replySubmit.onclick = submitReply;
      replyInput.onkeydown = (e) => {
        if (e.key === "Enter") submitReply();
      };

      cDiv.appendChild(repliesWrap);
      cDiv.appendChild(replyInputWrap);
      commentListEl.appendChild(cDiv);
    });
  }

  // ── 댓글 액션 (전역) ──
  window.deleteComment = (ci) => {
    if (!confirm("댓글을 삭제할까요?")) return;
    const data = getData();
    const p = data.find((x) => x.id === id);
    p.comments.splice(ci, 1);
    saveData(data);
    renderComments();
  };

  window.deleteReply = (ci, ri) => {
    if (!confirm("답글을 삭제할까요?")) return;
    const data = getData();
    const p = data.find((x) => x.id === id);
    p.comments[ci].replies.splice(ri, 1);
    saveData(data);
    renderComments();
  };

  window.openCommentEdit = (ci) => {
    const post = getPost();
    if (!post) return;
    commentEditInput.value = post.comments[ci].text;
    editingCommentPath = { commentIdx: ci };
    commentEditModal.style.display = "flex";
  };

  window.openReplyEdit = (ci, ri) => {
    const post = getPost();
    if (!post) return;
    commentEditInput.value = post.comments[ci].replies[ri].text;
    editingCommentPath = { commentIdx: ci, replyIdx: ri };
    commentEditModal.style.display = "flex";
  };

  // ── 댓글 등록 ──
  const submitComment = () => {
    const text = commentInput.value.trim();
    if (!text) return;
    const data = getData();
    const p = data.find((x) => x.id === id);
    p.comments = p.comments || [];
    p.comments.push({
      text,
      createdAt: Date.now(),
      edited: false,
      replies: [],
    });
    saveData(data);
    commentInput.value = "";
    renderComments();
  };
  commentSubmit.onclick = submitComment;
  commentInput.onkeydown = (e) => {
    if (e.key === "Enter") submitComment();
  };

  // ── 초기 렌더 ──
  const initialPost = getPost();
  if (!initialPost) {
    container.innerHTML = `<div class="empty-state"><p>게시글을 찾을 수 없어요</p></div>`;
  } else {
    renderDetail();
    renderComments();
  }
}

// ── 댓글+대댓글 총 개수 (전역) ──────────────────────────
function countComments(comments) {
  if (!comments || comments.length === 0) return 0;
  return comments.reduce((sum, c) => sum + 1 + (c.replies || []).length, 0);
}
