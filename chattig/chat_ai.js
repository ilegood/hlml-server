let socket; // 소켓 통신을 위한 전역 변수

document.addEventListener("DOMContentLoaded", () => {
  const inputField = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  const connectBtn = document.getElementById("connect-human-btn");

  // 이벤트 리스너 연결
  sendBtn.addEventListener("click", sendMessage);
  inputField.addEventListener("keypress", handleKeyPress);

  if (connectBtn) {
    connectBtn.addEventListener("click", connectToHuman);
  }
});

async function connectToHuman() {
  addMessage("서버(상담원)와 연결을 시도합니다...", "bot");

  // Socket.IO를 이용해 실시간 연결
  socket = io("http://localhost:3000");

  socket.on("system", (message) => {
    addMessage(message, "bot");
    const connectBtn = document.getElementById("connect-human-btn");
    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.textContent = "연결됨";
    }
  });

  socket.on("chat message", (message) => {
    addMessage(message, "bot"); // 상대방이 보낸 메시지를 왼쪽에 표시
  });

  socket.on("connect_error", (err) => {
    addMessage("서버 연결 실패. 서버가 실행 중인지 확인하세요.", "bot");
  });
}

async function sendMessage() {
  const inputField = document.getElementById("chat-input");
  const messageText = inputField.value.trim();

  if (messageText !== "") {
    // 사용자의 메시지를 추가합니다.
    addMessage(messageText, "user");
    inputField.value = "";

    if (socket && socket.connected) {
      // Socket.IO를 통해 다른 접속자에게 메시지 전송
      socket.emit("chat message", messageText);
    } else {
      addMessage("먼저 '사람과 대화하기' 버튼을 눌러주세요.", "bot");
    }
  }
}

// Enter 키를 누를 때 메시지가 전송되도록 합니다.
function handleKeyPress(event) {
  if (event.key === "Enter") {
    sendMessage();
  }
}

// 메시지를 화면에 추가하는 함수입니다.
function addMessage(text, sender) {
  const messagesContainer = document.getElementById("chat-messages");
  const messageElement = document.createElement("div");

  messageElement.classList.add("message");
  messageElement.classList.add(sender);
  messageElement.textContent = text;

  messagesContainer.appendChild(messageElement);

  // 새 메시지가 추가될 때마다 스크롤을 가장 아래로 내립니다.
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
