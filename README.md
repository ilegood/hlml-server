# 💬 할래말래 - Server

> 관심사가 비슷한 사람들과 함께 모임을 만들고 참여할 수 있도록 지원하는 커뮤니티 서비스의 Backend Server

[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?logo=github)](https://github.com/ilegood/hlml-server)

---

## 📖 Description

**할래말래**는 혼자서는 하기 어려운 활동을 함께할 사람을 찾고,
관심사와 지역, 일정 등의 조건을 기반으로 새로운 모임을 만들고 참여할 수 있도록 지원하는 커뮤니티 웹 서비스입니다.

본 Repository는 **할래말래의 Backend Server**로,

- 사용자 관리
- 모임 및 게시글 관리
- 댓글 및 좋아요
- 사용자 간 관계 관리
- 신고 기능
- 실시간 채팅
- 이미지 업로드
- 이메일 인증

등의 기능을 API와 실시간 통신을 통해 제공합니다.

Frontend와 Backend를 분리하여 개발했으며,
Frontend는 별도의 Repository에서 관리합니다.

👉 [할래말래 Client Repository](https://github.com/ilegood/hlml-client)

---

## 🖥️ Service

### 할래말래

관심사가 비슷한 사람들과 함께할 수 있는 모임을 찾고 직접 만들어보세요.

사용자는 원하는 카테고리와 지역, 날짜 및 시간 등의 조건을 활용하여
자신에게 맞는 모임을 탐색할 수 있습니다.

모임에 참여한 이후에는 해당 모임의 채팅방을 통해
참여자들과 실시간으로 소통할 수 있습니다.

---

## ⭐ Main Features

### 👤 회원 관리

- 회원가입 / 로그인
- JWT 기반 인증
- 비밀번호 암호화
- 이메일 인증
- 사용자 프로필 관리
- 관심 카테고리 관리
- 회원 정보 수정
- 회원 탈퇴

### 👥 모임 및 게시글

- 모임 게시글 생성 / 조회 / 수정 / 삭제
- 모임 모집 인원 관리
- 모임 참가 및 취소
- 모임 날짜 / 시간 / 장소 관리
- 카테고리 및 태그 관리
- 위치 정보 관리
- 게시글 좋아요
- 게시글 신고
- 모임 참여자 관리

### 💬 커뮤니티

- 댓글 작성 / 수정 / 삭제
- 대댓글 지원
- 댓글 이미지 첨부
- 사용자 간 관계 관리
- 사용자 차단

### 💌 실시간 채팅

- Socket.IO 기반 실시간 통신
- 모임별 채팅방
- 메시지 저장
- 메시지 수정 / 삭제
- 메시지 답장
- 이모지 반응
- 읽음 상태 관리
- 1:1 DM

### 🖼️ 이미지 처리

- 이미지 업로드
- 이미지 리사이징 및 최적화
- Cloudinary를 이용한 이미지 저장
- 프로필 및 게시글 이미지 관리

### 🚨 신고 및 관리

- 사용자 신고
- 게시글 신고
- 댓글 신고
- 신고 상태 관리
- 신고 대상 정보 저장

---

## 🛠️ Tech Stack

| Category | Technology |
|---|---|
| Language | JavaScript |
| Runtime | Node.js |
| Framework | Express.js |
| Database | MySQL |
| Authentication | JWT |
| Password Encryption | bcrypt |
| Real-time Communication | Socket.IO |
| File Upload | Multer |
| Image Processing | Sharp |
| Image Storage | Cloudinary |
| Email | Nodemailer |
| Scheduler | node-cron |
| Environment | dotenv |
| Deployment | Docker / Fly.io |
| Development | Nodemon |
| Version Control | Git / GitHub |

---

## 🏗️ Server Architecture

서버는 기능별 책임을 분리하여 관리할 수 있도록 구성했습니다.

```text
Client
   │
   │ HTTP / WebSocket
   ▼
┌─────────────────────────────┐
│          Express            │
├─────────────────────────────┤
│          Routes             │
├─────────────────────────────┤
│        Middleware           │
├─────────────────────────────┤
│        Controllers          │
├─────────────────────────────┤
│          Services           │
├─────────────────────────────┤
│        Repositories         │
├─────────────────────────────┤
│           MySQL             │
└─────────────────────────────┘

        │
        ├── Socket.IO
        │
        ├── Cloudinary
        │
        └── Email Service
