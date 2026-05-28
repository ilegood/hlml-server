CREATE TABLE users (
    user_id      INT AUTO_INCREMENT PRIMARY KEY,
    nickname     VARCHAR(50)  NOT NULL UNIQUE,
    email        VARCHAR(100) NOT NULL UNIQUE,
    password     VARCHAR(255) NOT NULL,
    birthday     DATE         NOT NULL,
    gender       ENUM('male', 'female') NOT NULL,
    phone_number VARCHAR(20)  NOT NULL,
    address      VARCHAR(255),
    profile_img  VARCHAR(300),
    bio          TEXT,
    total_joins  INT DEFAULT 0,
    cancel_count INT DEFAULT 0,
    report_count INT DEFAULT 0,
    is_deleted   BOOLEAN DEFAULT FALSE,
    is_verified  BOOLEAN DEFAULT FALSE,
    created_at   DATETIME DEFAULT NOW()
);

CREATE TABLE email_verification_tokens (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uq_token_hash (token_hash)
);

CREATE TABLE user_relations (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    requester_id   INT NOT NULL,
    target_id      INT NOT NULL,
    status         ENUM('pending', 'accepted', 'blocked') NOT NULL DEFAULT 'pending',
    requester_memo TEXT,
    target_memo    TEXT,
    FOREIGN KEY (requester_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uq_relation (requester_id, target_id)
);

CREATE TABLE posts (
    post_id      INT AUTO_INCREMENT PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    content      TEXT NOT NULL,
    date         DATE,
    time         TIME,
    place        VARCHAR(255),
    map          VARCHAR(500),
    latitude     DECIMAL(10, 8),
    longitude    DECIMAL(11, 8),
    capacity     INT DEFAULT 2,
    participants INT DEFAULT 1,
    status       VARCHAR(20) DEFAULT '모집중',
    categories   JSON,
    image        VARCHAR(500),
    user_id      INT NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited       BOOLEAN DEFAULT FALSE,
    report_count INT DEFAULT 0,
    is_deleted   BOOLEAN DEFAULT FALSE,
    is_author_hidden BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_posts_user_id (user_id)
);

CREATE TABLE post_likes (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    post_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    UNIQUE KEY uq_post_like (user_id, post_id)
);

CREATE TABLE comments (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    post_id    INT NOT NULL,
    user_id    INT NOT NULL,
    content    TEXT NOT NULL,
    parent_id  INT DEFAULT NULL,
    image      VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited     BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
    INDEX idx_comments_post_id (post_id),
    INDEX idx_comments_user_id (user_id),
    INDEX idx_comments_parent_id (parent_id)
);

CREATE TABLE post_participants (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    is_hidden BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uq_participant (post_id, user_id)
);

CREATE TABLE appointment_completions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    post_id      INT NOT NULL,
    completed_at DATETIME NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uq_appointment_completion (user_id, post_id),
    INDEX idx_appointment_completions_user_id (user_id)
);

CREATE TABLE reports (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    reporter_id       INT NOT NULL,
    target_id         INT NOT NULL,
    post_id           INT DEFAULT NULL,
    comment_id        INT DEFAULT NULL,
    report_type       VARCHAR(20) NOT NULL DEFAULT 'user',
    target_post_id    INT DEFAULT NULL,
    target_comment_id INT DEFAULT NULL,
    target_title      VARCHAR(255),
    target_excerpt    TEXT,
    reason            VARCHAR(100) NOT NULL,
    content           TEXT NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    INDEX idx_reports_reporter_id (reporter_id),
    INDEX idx_reports_target_id (target_id),
    INDEX idx_reports_post_id (post_id),
    INDEX idx_reports_comment_id (comment_id)
);

CREATE TABLE messages (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    room_id    VARCHAR(50) NOT NULL,
    user_id    INT NOT NULL,
    nickname   VARCHAR(100) NOT NULL,
    content    TEXT NOT NULL,
    is_system  BOOLEAN DEFAULT FALSE,
    is_edited  BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    parent_id  INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE SET NULL,
    INDEX idx_messages_room_id (room_id),
    INDEX idx_messages_user_id (user_id),
    INDEX idx_messages_parent_id (parent_id)
);

CREATE TABLE message_reactions (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id    INT NOT NULL,
    emoji      VARCHAR(10) NOT NULL,
    UNIQUE KEY uq_reaction (message_id, user_id, emoji),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_message_reactions_user_id (user_id)
);

CREATE TABLE message_reads (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id    INT NOT NULL,
    UNIQUE KEY uq_read (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_message_reads_user_id (user_id)
);

CREATE TABLE World_map (
    map_id      INT AUTO_INCREMENT PRIMARY KEY,
    post_id     INT NOT NULL,
    place_name  VARCHAR(255) NOT NULL,
    address     VARCHAR(255) NOT NULL,
    latitude    DECIMAL(10, 8) NOT NULL,
    longitude   DECIMAL(11, 8) NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
);

CREATE TABLE dm_rooms (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user1_id    INT NOT NULL,
    user2_id    INT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dm (user1_id, user2_id),
    FOREIGN KEY (user1_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(user_id) ON DELETE CASCADE
);

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
