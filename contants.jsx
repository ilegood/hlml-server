export const CATEGORY_MAP = {
  성별: ["남성", "여성", "혼성"],
  나이: ["10대", "20대", "30대", "40대", "50대 이상"],
  흡연: ["흡연자", "비흡연자"],
  음주: ["음주", "금주"],
  활동: ["식사", "운동", "수다", "게임", "산책", "창작", "휴식", "기타"],
};

export const getTimeAgo = (ts) => {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  return `${day}일 전`;
};
