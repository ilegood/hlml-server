/* ------------------------------------------------------------------------------------------------------
    할래말래 HALAE-MALAE / 통합 데이터베이스 스케마
------------------------------------------------------------------------------------------------------ */

-- 1. 사용자 테이블
CREATE TABLE users (
    user_id      INT AUTO_INCREMENT PRIMARY KEY,
    nickname     VARCHAR(50)  NOT NULL UNIQUE,
    email        VARCHAR(100) NOT NULL UNIQUE,
    password     VARCHAR(255) NOT NULL,
    birthday     DATE         NOT NULL,
    gender       ENUM('남', '여') NOT NULL,
    phone_number VARCHAR(20)  NOT NULL,
    address      VARCHAR(255),
    profile_img  VARCHAR(300),
    bio          TEXT,
    total_joins  INT DEFAULT 0,
    cancel_count INT DEFAULT 0,
    is_deleted   BOOLEAN DEFAULT FALSE,
    created_at   DATETIME DEFAULT NOW()
);

-- 2. 친구 및 관계 테이블
CREATE TABLE user_relations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requester_id INT NOT NULL,
    target_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'blocked') NOT NULL DEFAULT 'pending',
    requester_memo TEXT,
    target_memo TEXT,
    
    FOREIGN KEY (requester_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    FOREIGN KEY (target_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    UNIQUE KEY uq_relation (requester_id, target_id)
);

-- 3. 게시글 (모임/방) 테이블
CREATE TABLE posts (
    post_id      INT AUTO_INCREMENT PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    content      TEXT NOT NULL,
    date         DATE,
    time         TIME,
    place        VARCHAR(255),
    map          VARCHAR(500),
    capacity     INT DEFAULT 2,
    participants INT DEFAULT 1,
    status       VARCHAR(20) DEFAULT '모집중',
    categories   JSON,
    image        VARCHAR(500),
    author       VARCHAR(100),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited       BOOLEAN DEFAULT FALSE
);

-- 4. 게시글 찜 목록
CREATE TABLE post_likes (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    post_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    UNIQUE KEY uq_post_like (user_id, post_id)
);

-- 5. 게시글 댓글
CREATE TABLE comments (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    post_id    INT NOT NULL,
    user_id    INT NOT NULL,
    content    TEXT NOT NULL,
    parent_id  INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited     BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 6. 게시글 참여자
CREATE TABLE post_participants (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uq_participant (post_id, user_id)
);

-- 7. 채팅 메시지
CREATE TABLE messages (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    room_id    VARCHAR(100) NOT NULL,
    user_id    VARCHAR(100) NOT NULL,
    nickname   VARCHAR(100) NOT NULL,
    content    TEXT NOT NULL,
    is_system  BOOLEAN DEFAULT FALSE,
    is_edited  BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    parent_id  INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. 채팅 메시지 리액션
CREATE TABLE message_reactions (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id    VARCHAR(100) NOT NULL,
    emoji      VARCHAR(10) NOT NULL,
    UNIQUE KEY uq_reaction (message_id, user_id, emoji),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- 9. 채팅 메시지 읽음
CREATE TABLE message_reads (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id    VARCHAR(100) NOT NULL,
    UNIQUE KEY uq_read (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- 채팅 약송 장속 지도
CREATE TABLE World_map (
    map_id      INT AUTO_INCREMENT PRIMARY KEY,
    post_id     INT NOT NULL, -- 어떤 게시물의 약속 장소인지
    place_name  VARCHAR(255) NOT NULL, -- 장소명 (예: 강남역 스타벅스)
    address     VARCHAR(255) NOT NULL, -- 전체 주소 (도로명/지번)
    latitude    DECIMAL(10, 8) NOT NULL, -- 위도 (예: 37.12345678)
    longitude   DECIMAL(11, 8) NOT NULL, -- 경도 (예: 127.12345678)
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
);

-- 10. 개인 메시지 방 테이블
CREATE TABLE dm_rooms (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user1_id    INT NOT NULL,
    user2_id    INT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dm (user1_id, user2_id),
    FOREIGN KEY (user1_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(user_id) ON DELETE CASCADE
);

DROP TABLE message_reads_status;

-- 11. 강퇴 및 차단 내역
CREATE TABLE post_bans (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    post_id    INT NOT NULL,
    user_id    INT NOT NULL,
    is_hidden  BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uq_ban (post_id, user_id)
);