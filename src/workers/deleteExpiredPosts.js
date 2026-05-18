import cron from "node-cron";
import pool from "../db.js";

const deleteExpiredPosts = async () => {
  console.log("Running scheduled job: Deleting expired posts...");
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const expiredDate = yesterday.toISOString().split('T')[0];

    const [expiredPosts] = await connection.query(
      "SELECT post_id FROM posts WHERE date = ?",
      [expiredDate]
    );

    if (expiredPosts.length === 0) {
      console.log("No expired posts found for deletion.");
      await connection.commit();
      connection.release();
      return;
    }

    const postIdsToDelete = expiredPosts.map(post => post.post_id);
    console.log(`Found ${postIdsToDelete.length} expired posts for date ${expiredDate}. Deleting...`);

    await connection.query("DELETE FROM messages WHERE room_id IN (?)", [postIdsToDelete]);
    await connection.query("DELETE FROM World_map WHERE post_id IN (?)", [postIdsToDelete]);
    await connection.query("DELETE FROM post_bans WHERE post_id IN (?)", [postIdsToDelete]);
    await connection.query("DELETE FROM posts WHERE post_id IN (?)", [postIdsToDelete]);

    await connection.commit();
    console.log(`Successfully deleted ${postIdsToDelete.length} expired posts.`);
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error during scheduled post deletion:", error);
  } finally {
    if (connection) connection.release();
  }
};

const sendDeletionWarnings = async (io) => {
  console.log("Running scheduled job: Sending deletion warnings...");
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const expiredDate = yesterday.toISOString().split('T')[0];

    const [expiredPosts] = await pool.query("SELECT post_id, title FROM posts WHERE date = ?", [expiredDate]);
    
    for (const post of expiredPosts) {
      const roomStr = String(post.post_id);
      const message = {
      id: `warn-${Date.now()}-${post.post_id}`,
      roomId: roomStr,
      userId: 0,
      nickname: "System",
      content: `게시글 '${post.title}'의 약속 시간이 지났습니다. 이 채팅방은 30분 뒤(자정)에 영구적으로 삭제됩니다.`,
      isSystem: true,
      isDeletionWarning: true, // 추가
      time: new Date().toISOString(),
      };
      io.to(roomStr).emit("receive_message", message);
      console.log(`Warning message sent to room '${roomStr}'`);
      }
      } catch (error) {
      console.error("Error sending deletion warnings:", error);
      }
      };

      export const scheduleTestDeletion = (io) => {
        cron.schedule("37 22 * * *", async () => {
          console.log("Running test deletion for 'test' room...");
          try {
            const [rows] = await pool.query("SELECT post_id FROM posts WHERE title = ?", ["test"]);
            if (rows.length === 0) {
              console.log("Room 'test' not found.");
              return;
            }
            const postId = rows[0].post_id;
            const roomStr = String(postId);

            // 1. 경고 메시지 전송
            const message = {
              id: `test-warn-${Date.now()}`,
              roomId: roomStr,
              userId: 0,
              nickname: "System",
              content: "게시글 'test'의 약속 시간이 지났습니다. 이 채팅방은 곧 영구적으로 삭제됩니다.",
              isSystem: true,
              isDeletionWarning: true,
              time: new Date().toISOString(),
            };
            io.to(roomStr).emit("receive_message", message);
            console.log("Warning message sent to 'test'.");

            // 2. 잠시 대기 후 삭제
            setTimeout(async () => {
              let connection = await pool.getConnection();
              await connection.beginTransaction();
              try {
                await connection.query("DELETE FROM messages WHERE room_id = ?", [roomStr]);
                await connection.query("DELETE FROM World_map WHERE post_id = ?", [postId]);
                await connection.query("DELETE FROM post_bans WHERE post_id = ?", [postId]);
                await connection.query("DELETE FROM posts WHERE post_id = ?", [postId]);
                await connection.commit();
                console.log("'test' room deleted successfully.");
              } catch (e) {
                await connection.rollback();
                console.error("Test deletion failed:", e);
              } finally {
                connection.release();
              }
            }, 5000); // 5초 후 삭제

          } catch (e) {
            console.error("Test job error:", e);
          }
        }, {
          scheduled: true,
          timezone: "Asia/Seoul"
        });
      };

export const startPostDeletionJob = (io) => {
  // 매일 23:30에 삭제 알림 발송
  cron.schedule("30 23 * * *", () => sendDeletionWarnings(io), {
    scheduled: true, timezone: "Asia/Seoul"
  });

  // 매일 00:00에 삭제 실행
  cron.schedule("0 0 * * *", deleteExpiredPosts, {
    scheduled: true, timezone: "Asia/Seoul"
  });
  console.log("Scheduled jobs for post deletion and warnings have been started.");
  
  scheduleTestDeletion(io);
};
