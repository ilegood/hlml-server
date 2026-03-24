-- 1. 유저 정보를 관리하는 테이블 (부모 테이블)
CREATE TABLE user_chatting (
    user_id INT AUTO_INCREMENT PRIMARY KEY, -- 고유한 유저 번호 (데이터 추가 시 1씩 자동 증가, 기본키 설정)
    name VARCHAR(50) NOT NULL,              -- 유저 이름 (최대 50자 가변 길이, 필수 입력)
    image VARCHAR(200)                      -- 유저 프로필 이미지 경로/URL (최대 200자, 선택 입력)
);

-- 2. 채팅 메시지를 관리하는 테이블 (자식 테이블)
CREATE TABLE Main_chatting (
    id INT AUTO_INCREMENT PRIMARY KEY,      -- 고유한 채팅 메시지 번호 (자동 증가, 기본키)
    user_id INT NOT NULL,                   -- 채팅을 작성한 유저의 ID (user_chatting의 user_id 참조용, 필수)
    emoticon VARCHAR(200),                  -- 이모티콘 이름 또는 경로 (선택)
    chatting TEXT NOT NULL,                 -- 채팅 내용 (긴 글 저장을 위해 TEXT 사용, 필수)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 채팅 작성 시간 (별도로 넣지 않아도 현재 시간이 자동 저장됨)
    FOREIGN KEY (user_id) REFERENCES user_chatting(user_id) ON DELETE CASCADE -- 외래키: 부모 테이블(유저)에서 유저가 삭제되면 그 유저가 친 채팅도 모두 함께 삭제됨
);
 SELECT * FROM user_chatting; -- 실행
 DROP TABLE user_chatting; -- 삭제 
 SELECT * FROM Main_chatting; -- 실행
 DROP TABLE Main_chatting; -- 삭제 
-- ==========================================
-- [테스트 데이터 추가 및 확인]
-- ==========================================
-- 1. '김붕어' 유저 추가
INSERT INTO user_chatting (name, image) VALUES ('김붕어', '/images/bungeo.png');

-- 2. '김붕어'가 작성하는 채팅 추가 (방금 추가된 유저의 ID를 가져와서 사용)
INSERT INTO Main_chatting (user_id, emoticon, chatting) VALUES (LAST_INSERT_ID(), 'smile.png', '안녕하세요! 김붕어입니다. 채팅창 테스트 중이에요 뽀글뽀글🫧');

-- 3. 두 테이블을 조인(JOIN)하여 실제 채팅창 화면처럼 데이터 한 번에 조회하기
SELECT u.name, u.image, c.chatting, c.created_at
FROM user_chatting u
JOIN Main_chatting c ON u.user_id = c.user_id;