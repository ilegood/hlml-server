import * as postService from "../services/postService.js";
import pool from "../db.js";

const buildAppointmentChangePayload = (before, after) => {
  if (!before || !after) return null;
  const changes = [];
  const placeChanged = String(before.place || "") !== String(after.place || "");

  if (placeChanged) {
    changes.push(`장소: ${after.place || "미정"}`);
  }

  if (String(before.date || "").slice(0, 10) !== String(after.date || "").slice(0, 10)) {
    changes.push(`날짜: ${String(after.date || "").slice(0, 10) || "미정"}`);
  }

  if (String(before.time || "").slice(0, 5) !== String(after.time || "").slice(0, 5)) {
    changes.push(`시간: ${String(after.time || "").slice(0, 5) || "미정"}`);
  }

  if (changes.length === 0) return null;

  return {
    kind: "appointment_change",
    text: `약속 정보가 변경되었습니다. ${changes.join(" / ")}`,
    changes,
    place: after.place || "",
    date: String(after.date || "").slice(0, 10) || "",
    time: String(after.time || "").slice(0, 5) || "",
    latitude: after.latitude != null ? Number(after.latitude) : null,
    longitude: after.longitude != null ? Number(after.longitude) : null,
    showMap:
      placeChanged &&
      after.latitude != null &&
      after.longitude != null &&
      !Number.isNaN(Number(after.latitude)) &&
      !Number.isNaN(Number(after.longitude)),
  };
};

const emitPostRoomUpdate = async (req, before, after) => {
  const io = req.app.get("io");
  if (!io || !after) return;

  const roomId = String(after.post_id);
  io.to(roomId).emit("room_info", {
    title: after.title,
    image: after.image,
    author: after.author,
    date: after.date,
    time: after.time,
    place: after.place,
    latitude: after.latitude,
    longitude: after.longitude,
    capacity: after.capacity,
    participants: after.participants,
    status: after.status,
    isDM: false,
  });

  const systemPayload = buildAppointmentChangePayload(before, after);
  if (!systemPayload) return;
  const systemContent = JSON.stringify(systemPayload);

  const [result] = await pool.query(
    "INSERT INTO messages (room_id, user_id, nickname, content, is_system) VALUES (?, ?, ?, ?, 1)",
    [roomId, req.userId, "System", systemContent],
  );

  io.to(roomId).emit("receive_message", {
    id: result.insertId,
    roomId,
    userId: req.userId,
    nickname: "System",
    content: systemContent,
    isSystem: true,
    created_at: new Date().toISOString(),
  });
};

export const getPosts = async (req, res) => {
  try {
    const visibleOnly = String(req.query.visibleOnly || "") === "1";
    const data = await postService.getPosts(req.userId, { visibleOnly });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: `server error: ${e.message}` });
  }
};

export const getPost = async (req, res) => {
  try {
    const data = await postService.getPost(req.params.id, req.userId);
    if (!data) return res.status(404).json({ message: "not found" });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "error" });
  }
};

export const createPost = async (req, res) => {
  try {
    const result = await postService.createPost(req);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ message: e.message || "create error" });
  }
};

export const updatePost = async (req, res) => {
  try {
    const before = await postService.getPost(req.params.id, req.userId);
    const affectedRows = await postService.updatePost(req);
    if (!affectedRows) return res.status(403).json({ message: "forbidden" });
    const after = await postService.getPost(req.params.id, req.userId);
    await emitPostRoomUpdate(req, before, after);
    res.json({ success: true, post: after });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ message: e.message || "update error" });
  }
};

export const deletePost = async (req, res) => {
  try {
    const affectedRows = await postService.deletePost(
      req.params.id,
      req.userId,
    );
    if (!affectedRows) return res.status(403).json({ message: "forbidden" });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "delete error" });
  }
};

export const likePost = async (req, res) => {
  try {
    const data = await postService.likePost(req.userId, req.params.id);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ message: "like error" });
  }
};

export const joinPost = async (req, res) => {
  try {
    const data = await postService.joinPost(req.userId, req.params.id);
    if (!data) return res.status(404).json({ message: "not found" });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ message: "join error" });
  }
};

export const leavePost = async (req, res) => {
  try {
    const data = await postService.leavePost(req.userId, req.params.id);
    if (!data) return res.status(404).json({ message: "not found" });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "leave error" });
  }
};

export const getComments = async (req, res) => {
  try {
    const data = await postService.getComments(req.params.id, req.userId);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "get comments error" });
  }
};

export const createComment = async (req, res) => {
  try {
    await postService.createComment(req);
    const data = await postService.getPost(req.params.id, req.userId);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ message: "comment create error" });
  }
};

export const updateComment = async (req, res) => {
  try {
    await postService.updateComment(req);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "comment update error" });
  }
};

export const deleteComment = async (req, res) => {
  try {
    await postService.deleteComment(req.params.id, req.userId);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "comment delete error" });
  }
};

export const getKickedPosts = async (req, res) => {
  try {
    const data = await postService.getKickedPosts(req.userId);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "get kicked posts error" });
  }
};

export const deletePostBan = async (req, res) => {
  try {
    await postService.deletePostBan(req.userId, req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "delete post ban error" });
  }
};
