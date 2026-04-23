/* ------------------------------------------------------------------------------------------------------
    할래말래 HALAE-MALAE / 사이트 스케줄
------------------------------------------------------------------------------------------------------ */
CREATE SCHEMA hlml;

CREATE TABLE users (
    user_id      INT AUTO_INCREMENT PRIMARY KEY,
    nickname     VARCHAR(50)  NOT NULL UNIQUE,
    email        VARCHAR(100) NOT NULL UNIQUE,
    password     VARCHAR(255) NOT NULL,
    birthday     DATE         NOT NULL,
    gender       ENUM('남', '여') NOT NULL,
    phone_number VARCHAR(20)  NOT NULL,
    profile_img  VARCHAR(300),
    bio          TEXT,
    total_joins  INT DEFAULT 0,
    cancel_count INT DEFAULT 0,
    created_at   DATETIME DEFAULT NOW()
);

CREATE TABLE user_relations (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    requester_id INT NOT NULL,
    target_id    INT NOT NULL,
    status       ENUM('pending', 'accepted', 'blocked') NOT NULL DEFAULT 'pending',

    FOREIGN KEY (requester_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (target_id)    REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uq_relation (requester_id, target_id)
);

/* ---------------------------------------------------------------------------------------------------------------------------- */

CREATE TABLE posts (
    post_id      INT AUTO_INCREMENT PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    content      TEXT NOT NULL,
    date         DATE,
    time         TIME,
    place        VARCHAR(255),
    capacity     INT DEFAULT 2,
    participants INT DEFAULT 1,       
    status       VARCHAR(20) DEFAULT '모집중',
    categories   JSON,
    image        LONGTEXT,
    author       VARCHAR(100),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited       BOOLEAN DEFAULT FALSE
);

-- 찜 목록
CREATE TABLE post_likes (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    post_id    INT NOT NULL,
    
    FOREIGN KEY (user_id)  REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (post_id)  REFERENCES posts(post_id) ON DELETE CASCADE,
    UNIQUE KEY uq_post_like (user_id, post_id)
);

-- 댓글
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