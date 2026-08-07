import express from "express";
import auth from "../middleware/auth.js";
import {
  chatUpload,
  getCloudinaryDownloadUrl,
  getCloudinaryResourceType,
  getDownloadProxyUrl,
  uploadChatFileToCloudinary,
} from "../services/chatFileService.js";
import {
  cacheLinkPreviewFailure,
  getLinkPreview,
} from "../services/linkPreviewService.js";
import * as chatRoomService from "../services/chatRoomService.js";
import { sendError } from "../utils/http.js";

const router = express.Router();

router.post("/upload", auth, chatUpload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "file is required" });
  }

  if (req.file.size === 0 || req.file.buffer.length === 0) {
    return res.status(400).json({ message: "빈 파일은 업로드할 수 없습니다." });
  }

  try {
    const result = await uploadChatFileToCloudinary(req.file);
    const resourceType = result.resource_type || getCloudinaryResourceType(req.file);

    res.json({
      url: result.secure_url,
      downloadUrl: getDownloadProxyUrl({
        url:
          resourceType === "raw"
            ? result.secure_url
            : getCloudinaryDownloadUrl({
                publicId: result.public_id,
                resourceType,
                filename: result.originalName,
              }),
        filename: result.originalName,
      }),
      publicId: result.public_id,
      resourceType,
      name: result.originalName,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (error) {
    console.error("Cloudinary chat upload failed:", error);
    res.status(500).json({ message: "file upload failed" });
  }
});

router.get("/link-preview", auth, async (req, res) => {
  const rawUrl = String(req.query.url || "").trim();

  try {
    const { status, body } = await getLinkPreview(rawUrl);
    res.status(status).json(body);
  } catch (error) {
    console.error("Link preview fetch failed:", error.name || error.message);
    const status = error.status || 502;
    const body = { message: error.message || "preview fetch failed" };
    cacheLinkPreviewFailure(rawUrl, status, body);
    res.status(status).json(body);
  }
});

router.get("/download", async (req, res) => {
  const { url, name } = req.query;

  try {
    const parsedUrl = new URL(String(url || ""));
    if (parsedUrl.hostname !== "res.cloudinary.com") {
      return res.status(400).json({ message: "invalid download url" });
    }

    const response = await fetch(parsedUrl);
    if (!response.ok || !response.body) {
      return res.status(502).json({ message: "download failed" });
    }

    const filename = String(name || "download").replace(/["\r\n]/g, "_");
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "application/octet-stream",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    console.error("Chat file download failed:", error);
    res.status(400).json({ message: "download failed" });
  }
});

router.get("/rooms/:roomId/block-warning", auth, async (req, res) => {
  try {
    res.json(
      await chatRoomService.getRoomBlockWarning({
        userId: req.userId,
        roomId: req.params.roomId,
      }),
    );
  } catch (error) {
    console.error("Blocked user warning lookup failed:", error);
    sendError(res, error, "blocked user warning lookup failed");
  }
});

router.get("/unread-summary", auth, async (req, res) => {
  try {
    res.json(await chatRoomService.getUnreadSummary(req.userId));
  } catch (error) {
    console.error("Unread summary lookup failed:", error);
    sendError(res, error, "unread summary lookup failed");
  }
});

router.get("/notifications", auth, async (req, res) => {
  try {
    res.json(await chatRoomService.getNotifications(req.userId));
  } catch (error) {
    console.error("Notifications lookup failed:", error);
    sendError(res, error, "notifications lookup failed");
  }
});

router.get("/dm", auth, async (req, res) => {
  try {
    res.json(await chatRoomService.getDmRooms(req.userId));
  } catch (error) {
    console.error("DM list lookup failed:", error);
    sendError(res, error, "DM list lookup failed");
  }
});

router.post("/dm", auth, async (req, res) => {
  try {
    res.json(
      await chatRoomService.createDmRoom({
        userId: req.userId,
        targetId: req.body.targetId,
      }),
    );
  } catch (error) {
    console.error("DM create failed:", error);
    sendError(res, error, "DM create failed");
  }
});

router.get("/dm/:roomId", auth, async (req, res) => {
  try {
    res.json(
      await chatRoomService.getDmRoom({
        userId: req.userId,
        roomId: req.params.roomId,
      }),
    );
  } catch (error) {
    console.error("DM lookup failed:", error);
    sendError(res, error, "DM lookup failed");
  }
});

router.delete("/dm/:roomId", auth, async (req, res) => {
  try {
    const { roomId, roomKey } = await chatRoomService.deleteDmRoom({
      userId: req.userId,
      roomId: req.params.roomId,
    });

    req.app.get("io")?.to(roomKey)?.emit("dm_room_deleted", {
      roomId,
      deletedBy: req.userId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("DM delete failed:", error);
    sendError(res, error, "dm delete failed");
  }
});

router.post("/share", auth, async (req, res) => {
  try {
    const { roomId, roomKey, message } = await chatRoomService.sharePostToDm({
      userId: req.userId,
      targetId: req.body.targetId,
      postId: req.body.postId,
    });

    req.app.get("io")?.to(roomKey)?.emit("receive_message", message);
    res.json({ success: true, roomId });
  } catch (error) {
    console.error("Share failed:", error);
    sendError(res, error, "post share failed");
  }
});

export default router;
