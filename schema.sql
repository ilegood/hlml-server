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
    is_deleted   BOOLEAN DEFAULT FALSE,
    created_at   DATETIME DEFAULT NOW()
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
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uq_participant (post_id, user_id)
);

CREATE TABLE messages (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    room_id    INT NOT NULL,
    user_id    INT NOT NULL,
    nickname   VARCHAR(100) NOT NULL,
    content    TEXT NOT NULL,
    is_system  BOOLEAN DEFAULT FALSE,
    is_edited  BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    parent_id  INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES posts(post_id) ON DELETE CASCADE,
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
