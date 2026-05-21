import * as postService from "../services/postService.js";

export const getPosts = async (req, res) => {
  try {
    const data = await postService.getPosts(req.userId);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: `server error: ${e.message}` });
  }
};

export const getMyChatRooms = async (req, res) => {
  try {
    const data = await postService.getMyChatRooms(req.userId);
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
    const affectedRows = await postService.updatePost(req);
    if (!affectedRows) return res.status(403).json({ message: "forbidden" });
    res.json({ success: true });
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

    const io = req.app.get("io");
    if (io && data.systemMessage) {
      const roomStr = String(req.params.id);
      io.to(roomStr).emit("receive_message", data.systemMessage);

      // Send entrance alarm to all participants
      if (data.systemMessage.content.includes("들어왔습니다")) {
        const members = [
          data.post.user_id,
          ...(data.post.joinedUserIds || []),
        ];
        members.forEach((memberId) => {
          if (String(memberId) !== String(req.userId)) {
            io.to(`user_${memberId}`).emit("entrance_alarm", {
              roomId: roomStr,
              roomTitle: data.post.title,
              message: data.systemMessage.content,
            });
          }
        });
      }
    }

    res.json(data.post);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ message: "join error" });
  }
};

export const leavePost = async (req, res) => {
  try {
    const data = await postService.leavePost(req.userId, req.params.id);
    if (!data) return res.status(404).json({ message: "not found" });

    const io = req.app.get("io");
    if (io && data.systemMessage) {
      io.to(String(req.params.id)).emit("receive_message", data.systemMessage);
    }

    res.json(data.post);
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
