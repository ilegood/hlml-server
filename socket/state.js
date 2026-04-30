// 메모리 데이터 저장소 (서버 재시작 시 초기화됨)
export const messages = {}; // 채널별 메시지 내역 저장소
export const users = new Map(); // 현재 접속 중인 소켓 정보 저장 (ID 기준)
export const members = new Map(); // 전체 유저 정보 저장 (닉네임 기준, 온라인/오프라인 상태 포함)
export const serverState = {
  serverHost: null // 서버 전체 방장
};
