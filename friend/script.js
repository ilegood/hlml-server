// 1. 임시 친구 데이터
const MOCK_FRIENDS = [
  {
    id: 1,
    name: "김현우",
    isOnline: true,
    isFriend: true,
    profile: "자기소개 내용입니다.",
  },
  {
    id: 2,
    name: "이현우",
    isOnline: true,
    isFriend: false,
    profile: "주황색 네모 예시",
  },
  {
    id: 3,
    name: "박현우",
    isOnline: true,
    isFriend: true,
    profile: "온라인 친구입니다.",
  },
  {
    id: 4,
    name: "최현우",
    isOnline: true,
    isFriend: true,
    profile: "스크롤 테스트용",
  },
  {
    id: 5,
    name: "정현우",
    isOnline: false,
    isFriend: true,
    profile: "오프라인 친구입니다.",
  },
  {
    id: 6,
    name: "강현우",
    isOnline: false,
    isFriend: false,
    profile: "오프라인, 친구 아님",
  },
  {
    id: 7,
    name: "조현우",
    isOnline: false,
    isFriend: true,
    profile: "디자인 포트폴리오 화이팅",
  },
];

// 2. DOM 요소 가져오기
const toggleBtn = document.getElementById("toggleBtn");
const sidebarContent = document.getElementById("sidebarContent");
const onlineList = document.getElementById("onlineList");
const offlineList = document.getElementById("offlineList");
const detailCard = document.getElementById("detailCard");
const detailName = document.getElementById("detailName");
const detailProfile = document.getElementById("detailProfile");

let isSidebarOpen = true;
let selectedFriendId = null;

// 3. 사이드바 열고 닫기 로직
toggleBtn.addEventListener("click", () => {
  isSidebarOpen = !isSidebarOpen;

  if (isSidebarOpen) {
    sidebarContent.classList.remove("hidden");
    toggleBtn.innerText = "친구 목록 닫기 〉";
  } else {
    sidebarContent.classList.add("hidden");
    toggleBtn.innerText = "〈 친구 목록 열기";
    closeDetailCard(); // 사이드바 닫을 때 상세보기도 닫기
  }
});

// 4. 상세보기 열기/닫기 로직
function handleFriendClick(friend, rowElement) {
  // 같은 친구를 다시 클릭하면 닫기
  if (selectedFriendId === friend.id) {
    closeDetailCard();
    return;
  }

  // 다른 친구 클릭 시
  selectedFriendId = friend.id;

  // 모든 행에서 active 클래스 제거 후, 클릭한 행에만 추가
  document
    .querySelectorAll(".friend-row")
    .forEach((row) => row.classList.remove("active"));
  rowElement.classList.add("active");

  // 상세 카드 정보 업데이트 및 표시
  detailName.innerText = friend.name;
  detailProfile.innerText = friend.profile;
  detailCard.classList.remove("hidden");
}

function closeDetailCard() {
  selectedFriendId = null;
  detailCard.classList.add("hidden");
  document
    .querySelectorAll(".friend-row")
    .forEach((row) => row.classList.remove("active"));
}

// 5. 친구 목록 렌더링 함수
function renderFriends() {
  const onlineFriends = MOCK_FRIENDS.filter((f) => f.isOnline);
  const offlineFriends = MOCK_FRIENDS.filter((f) => !f.isOnline);

  // 테이블 행을 만드는 헬퍼 함수
  const createRow = (friend) => {
    const tr = document.createElement("tr");
    tr.className = "friend-row";

    tr.innerHTML = `
      <td class="avatar-cell"><div class="avatar"></div></td>
      <td class="name-cell">${friend.name}</td>
      <td class="status-cell">
        <div class="status-square ${friend.isFriend ? "is-friend" : "not-friend"}"></div>
      </td>
    `;

    // 클릭 이벤트 연결
    tr.addEventListener("click", () => handleFriendClick(friend, tr));
    return tr;
  };

  // 온라인 목록 추가
  onlineFriends.forEach((friend) => {
    onlineList.appendChild(createRow(friend));
  });

  // 오프라인 목록 추가
  offlineFriends.forEach((friend) => {
    offlineList.appendChild(createRow(friend));
  });
}

// 스크립트가 로드되면 친구 목록 그리기 실행
renderFriends();
