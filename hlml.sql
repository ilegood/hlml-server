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
