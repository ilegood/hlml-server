/* ------------------------------------------------------------------------------------------------------
	할래말래 HALAE-MALAE / 사이트 스케줄
------------------------------------------------------------------------------------------------------ */
CREATE SCHEMA hlml;

CREATE TABLE users (
	user_id INT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    birthday DATE NOT NULL,
    gender ENUM('남', '여') NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    profile_img VARCHAR(300),
    bio TEXT,
    total_joins INT DEFAULT 0,
    cancel_count INT DEFAULT 0,
    created_at DATETIME DEFAULT NOW()
);

SELECT * FROM users;

DROP TABLE users;

/* ---------------------------------------------------------------------------------------------------------------------------- */
CREATE TABLE categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO categories(name)
VALUES('user02');

SELECT * FROM categories;

DROP TABLE categories;
/* ---------------------------------------------------------------------------------------------------------------------------- */


     /* 이제 깨끗한 상태에서 posts 테이블을 만듭니다 */
     CREATE TABLE posts (
      id INT NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      date DATE,
      time TIME,
      place VARCHAR(255),
      capacity INT DEFAULT 4,
      participants INT DEFAULT 0,
      status VARCHAR(20) DEFAULT '모집중',
      categories JSON,
      image LONGTEXT,
      author VARCHAR(100),
      likes INT DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      edited BOOLEAN DEFAULT FALSE,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
   
    /* 그 다음 comments 테이블을 만듭니다 */
    CREATE TABLE comments (
      id INT NOT NULL AUTO_INCREMENT,
      post_id INT NOT NULL,
      text TEXT NOT NULL,
      author VARCHAR(100),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      edited BOOLEAN DEFAULT FALSE,
      parent_id INT DEFAULT NULL,
      PRIMARY KEY (id),
      CONSTRAINT fk_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    
        ALTER TABLE posts ADD COLUMN comments JSON DEFAULT (JSON_ARRAY());
    ALTER TABLE posts ADD COLUMN likedBy JSON DEFAULT (JSON_ARRAY());
    ALTER TABLE posts ADD COLUMN joinedBy JSON DEFAULT (JSON_ARRAY());