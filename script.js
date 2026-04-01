// ================= 카테고리 =================
const CATEGORY_MAP = {
  성별: ["남성", "여성", "혼성"],
  나이: ["10대", "20대", "30대", "40대", "50대 이상"],
  흡연: ["흡연자", "비흡연자"],
  음주: ["음주", "금주"],
  활동: ["식사", "운동", "수다", "게임", "산책", "창작", "휴식", "기타"],
};

let data = JSON.parse(localStorage.getItem("posts") || "[]");

function saveData() {
  localStorage.setItem("posts", JSON.stringify(data));
}

// ================= 공통 렌더 =================
function renderCategories(container, selected, onChange) {
  container.innerHTML = "";

  const row = document.createElement("div");
  row.className = "category-row";

  Object.entries(CATEGORY_MAP).forEach(([category, options]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "category-wrapper";

    const title = document.createElement("div");
    title.className = "category-title";
    title.textContent = category;

    const optionBox = document.createElement("div");
    optionBox.className = "category-dropdown";

    title.onclick = (e) => {
      e.stopPropagation();

      // 🔥 다른 열린거 닫기
      document
        .querySelectorAll(".category-dropdown")
        .forEach((el) => (el.style.display = "none"));

      // 🔥 토글
      optionBox.style.display =
        optionBox.style.display === "block" ? "none" : "block";
    };

    options.forEach((option) => {
      const btn = document.createElement("div");
      btn.className = "tag-btn";
      btn.textContent = option;

      if (selected[category] === option) {
        btn.classList.add("active");
      }

      btn.onclick = (e) => {
        e.stopPropagation();

        selected[category] = selected[category] === option ? null : option;

        onChange();

        optionBox.style.display = "none"; // 선택 후 닫기
      };

      optionBox.appendChild(btn);
    });

    wrapper.appendChild(title);
    wrapper.appendChild(optionBox);
    row.appendChild(wrapper);
  });

  container.appendChild(row);

  // 🔥 바깥 클릭하면 닫힘
  document.addEventListener("click", () => {
    document
      .querySelectorAll(".category-dropdown")
      .forEach((el) => (el.style.display = "none"));
  });
}

// ================= 글쓰기 =================
if (document.getElementById("addBtn")) {
  const titleInput = document.getElementById("titleInput");
  const contentInput = document.getElementById("contentInput");
  const imageInput = document.getElementById("imageInput");
  const writeTags = document.getElementById("writeTags");
  const addBtn = document.getElementById("addBtn");

  let selectedCategories = {};
  let imageData = "";

  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      imageData = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  function refresh() {
    renderCategories(writeTags, selectedCategories, refresh);
  }

  refresh();

  addBtn.onclick = () => {
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();

    if (!title || !content) {
      alert("제목, 내용 입력!");
      return;
    }

    data.push({
      id: Date.now(),
      title,
      content,
      categories: selectedCategories,
      image: imageData,
      createdAt: Date.now(),
    });

    saveData();
    location.href = "index.html";
  };
}

// ================= 메인 =================
if (document.getElementById("cardList")) {
  const cardList = document.getElementById("cardList");
  const searchInput = document.getElementById("searchInput");
  const tagFilters = document.getElementById("tagFilters");

  let selectedCategories = {};

  function render() {
    renderCategories(tagFilters, selectedCategories, () => {
      render();
      applyFilters();
    });
  }

  function renderCards(list) {
    cardList.innerHTML = "";

    const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);

    if (sorted.length === 0) {
      cardList.innerHTML = "<p>게시글 없음</p>";
      return;
    }

    sorted.forEach((item) => {
      const div = document.createElement("div");
      div.className = "card";
      div.style.display = "flex";
      div.style.cursor = "pointer";

      div.onclick = () => {
        location.href = `detail.html?id=${item.id}`;
      };

      const categoryView = Object.entries(item.categories || {})
        .map(([k, v]) => `<span class="tag">${k}:${v}</span>`)
        .join("");

      div.innerHTML = `
        ${
          item.image
            ? `<img src="${item.image}" style="width:80px;height:80px;object-fit:cover;margin-right:10px;border-radius:6px;">`
            : `<div style="width:80px;height:80px;background:#eee;margin-right:10px;"></div>`
        }
        <div>
          <div><b>${item.title}</b></div>
          <div style="font-size:12px;color:#666;">${item.content}</div>
          <div>${categoryView}</div>
        </div>
      `;

      cardList.appendChild(div);
    });
  }

  function applyFilters() {
    const keyword = searchInput.value.toLowerCase();

    const result = data.filter((item) => {
      const matchText =
        item.title.toLowerCase().includes(keyword) ||
        item.content.toLowerCase().includes(keyword);

      const matchCategory = Object.entries(selectedCategories).every(
        ([key, value]) => !value || item.categories?.[key] === value,
      );

      return matchText && matchCategory;
    });

    renderCards(result);
  }

  searchInput.oninput = applyFilters;

  render();
  applyFilters();
}

// ================= 상세 =================
if (document.getElementById("detailPage")) {
  const params = new URLSearchParams(location.search);
  const id = Number(params.get("id"));

  const post = data.find((p) => p.id === id);
  const container = document.getElementById("detailPage");

  if (!post) {
    container.innerHTML = "<p>게시글 없음</p>";
  } else {
    const categoryView = Object.entries(post.categories || {})
      .map(([k, v]) => `<span class="tag">${k}:${v}</span>`)
      .join("");

    container.innerHTML = `
      <h2>${post.title}</h2>
      <p>${post.content}</p>
      ${
        post.image
          ? `<img src="${post.image}" style="width:100%;margin:10px 0;">`
          : ""
      }
      <div>${categoryView}</div>
    `;
  }
}
