# 할래말래 - Server

> 2인 이상이 함께 활동할 수 있는 모임을 만들고 참여할 수 있도록 지원하는 커뮤니티 서비스의 백엔드

## 📌 프로젝트 소개

**할래말래**는 관심사와 활동 지역 등을 기반으로 원하는 모임을 찾고,
새로운 사람들과 함께 활동할 수 있도록 돕는 커뮤니티 웹 서비스입니다.

본 Repository는 할래말래 서비스의 **Backend Server**를 담당합니다.

사용자 정보, 모임, 게시글, 카테고리 등의 데이터를 관리하며
프론트엔드와 API를 통해 통신하고 실시간 채팅 기능을 지원합니다.

---

## 🛠️ 기술 스택

| 분야 | 기술 |
|---|---|
| Runtime | Node.js |
| Backend | Express.js |
| Database | MySQL |
| Authentication | JWT |
| Password Security | bcrypt |
| Real-time Communication | Socket.IO |
| File Upload | Multer |
| Image Processing | Sharp |
| Image Storage | Cloudinary |
| Email | Nodemailer |
| Scheduler | node-cron |
| Environment | dotenv |
| Deployment | Docker, Fly.io |
| Version Control | Git, GitHub |

---

## ✨ 주요 기능

### 👤 사용자 관리
- 회원가입 및 로그인
- JWT 기반 인증
- 비밀번호 암호화
- 사용자 프로필 관리
- 관심 카테고리 관리
- 회원 정보 수정 및 탈퇴

### 👥 모임 관리
- 모임 생성
- 모임 정보 수정
- 모임 게시글 관리
- 모임 카테고리 및 태그 관리
- 모임 위치 정보 관리

### 💬 실시간 채팅
- Socket.IO를 활용한 실시간 통신
- 모임별 채팅방 구성
- 모임 게시글과 채팅방 연동

### 📝 게시글 및 커뮤니티
- 모임 게시글
- 후기 및 댓글
- 카테고리 기반 분류
- 게시글 및 사용자 데이터 관리

### 🖼️ 이미지 처리
- 이미지 업로드
- 이미지 리사이징 및 처리
- Cloudinary를 활용한 이미지 저장

---

## 🏗️ 서버 구조

```text
hlml-server/
├── src/
│   ├── ...
│   └── app.js
├── uploads/
├── .github/
│   └── workflows/
├── Dockerfile
├── fly.toml
├── schema.sql
├── check_db.js
└── package.json
