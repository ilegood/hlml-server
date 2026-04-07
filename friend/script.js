// 1. 임시 친구 데이터 (memo 속성 추가됨)
const MOCK_FRIENDS = [
  {
    id: 1,
    name: "김현우",
    isOnline: true,
    isFriend: true,
    profile: "자기소개 내용입니다.",
    memo: "",
  },
  {
    id: 2,
    name: "이현우",
    isOnline: true,
    isFriend: false,
    profile: "주황색 네모 예시",
    memo: "",
  },
  {
    id: 3,
    name: "박현우",
    isOnline: true,
    isFriend: true,
    profile: "온라인 친구입니다.",
    memo: "",
  },
  {
    id: 4,
    name: "최현우",
    isOnline: true,
    isFriend: true,
    profile: "스크롤 테스트용",
    memo: "",
  },
  {
    id: 5,
    name: "정현우",
    isOnline: false,
    isFriend: true,
    profile: "오프라인 친구입니다.",
    memo: "",
  },
  {
    id: 6,
    name: "강현우",
    isOnline: false,
    isFriend: false,
    profile: "오프라인, 친구 아님",
    memo: "",
  },
  {
    id: 7,
    name: "조현우",
    isOnline: false,
    isFriend: true,
    profile: "디자인 포트폴리오 화이팅",
    memo: "",
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

// 메모 관련 요소 가져오기
const memoBtn = document.getElementById("memoBtn");
const memoInputArea = document.getElementById("memoInputArea");
const memoInput = document.getElementById("memoInput");
const saveMemoBtn = document.getElementById("saveMemoBtn");
const cancelMemoBtn = document.getElementById("cancelMemoBtn");
const memoDisplayArea = document.getElementById("memoDisplayArea");
const savedMemoText = document.getElementById("savedMemoText");

let isSidebarOpen = true;
let currentFriend = null; // 현재 선택된 친구 객체 통째로 저장

// 3. 사이드바 열고 닫기
toggleBtn.addEventListener("click", () => {
  isSidebarOpen = !isSidebarOpen;

  if (isSidebarOpen) {
    sidebarContent.classList.remove("hidden");
    toggleBtn.innerText = " 〉";
  } else {
    sidebarContent.classList.add("hidden");
    toggleBtn.innerText = "〈 ";
    closeDetailCard();
  }
});

// 4. 상세보기 및 메모 데이터 연동 로직
function handleFriendClick(friend, rowElement) {
  // 같은 친구를 다시 클릭하면 닫기
  if (currentFriend && currentFriend.id === friend.id) {
    closeDetailCard();
    return;
  }

  // 다른 친구 클릭 시
  currentFriend = friend;

  // 모든 행에서 active 클래스 제거 후, 클릭한 행에만 추가
  document
    .querySelectorAll(".friend-row")
    .forEach((row) => row.classList.remove("active"));
  rowElement.classList.add("active");

  // 상세 카드 정보 업데이트
  detailName.innerText = friend.name;
  detailProfile.innerText = friend.profile;

  // 창을 열 때 메모 입력창은 닫아두고 버튼만 보이게 초기화
  memoInputArea.classList.add("hidden");
  memoBtn.classList.remove("hidden");

  // 저장된 메모가 있으면 보여주기, 없으면 숨기기
  if (friend.memo) {
    savedMemoText.innerText = friend.memo;
    memoDisplayArea.classList.remove("hidden");
    memoBtn.innerText = "메모 수정";
  } else {
    memoDisplayArea.classList.add("hidden");
    memoBtn.innerText = "메모 추가";
  }

  detailCard.classList.remove("hidden");
}

function closeDetailCard() {
  currentFriend = null;
  detailCard.classList.add("hidden");
  document
    .querySelectorAll(".friend-row")
    .forEach((row) => row.classList.remove("active"));
}

// 5. 메모장 기능 이벤트 리스너
// "메모 추가/수정" 버튼 클릭 시 -> 입력창 열기
memoBtn.addEventListener("click", () => {
  memoBtn.classList.add("hidden");
  memoInputArea.classList.remove("hidden");
  memoInput.value = currentFriend.memo; // 기존 메모 내용 불러오기
  memoInput.focus();
});

// "취소" 버튼 클릭 시 -> 입력창 닫기
cancelMemoBtn.addEventListener("click", () => {
  memoInputArea.classList.add("hidden");
  memoBtn.classList.remove("hidden");
});

// "저장" 버튼 클릭 시 -> 데이터 업데이트 및 화면 반영
saveMemoBtn.addEventListener("click", () => {
  const newMemo = memoInput.value.trim();
  currentFriend.memo = newMemo; // 배열 내 선택된 친구 데이터 업데이트

  memoInputArea.classList.add("hidden");
  memoBtn.classList.remove("hidden");

  if (newMemo) {
    savedMemoText.innerText = newMemo;
    memoDisplayArea.classList.remove("hidden");
    memoBtn.innerText = "메모 수정";
  } else {
    memoDisplayArea.classList.add("hidden");
    memoBtn.innerText = "메모 추가";
  }
});

// 6. 친구 목록 렌더링 함수
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

// 스크립트가 로드되면 친구 목록 그리기 최초 1회 실행
renderFriends();
