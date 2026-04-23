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
    id           INT AUTO_INCREMENT PRIMARY KEY,
    requester_id INT NOT NULL,
    target_id    INT NOT NULL,
    status       ENUM('pending', 'accepted', 'blocked') NOT NULL DEFAULT 'pending',
    FOREIGN KEY (requester_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (target_id)    REFERENCES users(user_id) ON DELETE CASCADE,
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
    image        LONGTEXT,
    author       VARCHAR(100),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited       BOOLEAN DEFAULT FALSE
);

-- 4. 게시글 찜 목록
CREATE TABLE post_likes (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    post_id    INT NOT NULL,
    FOREIGN KEY (user_id)  REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (post_id)  REFERENCES posts(post_id) ON DELETE CASCADE,
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
    FOREIGN KEY (post_id)  REFERENCES posts(post_id) ON DELETE CASCADE, 
    FOREIGN KEY (user_id)  REFERENCES users(user_id) ON DELETE CASCADE
);

-- 6. 실시간 채팅 메시지 테이블 (모임 안에서의 채팅)
CREATE TABLE chat_messages (
    message_id   INT AUTO_INCREMENT PRIMARY KEY,
    post_id      INT NOT NULL,
    user_id      INT NOT NULL,
    message      TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
