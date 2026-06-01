import cron from "node-cron";
import pool from "../db.js";

const TIMEZONE = "Asia/Seoul";

const getSeoulDateTimeString = (offsetMinutes = 0) => {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
};

const REMINDER_INTERVALS = [30, 20, 10];

const getUpcomingAppointmentReminders = async (minutesBefore) => {
  const windowStart = getSeoulDateTimeString(minutesBefore);
  const windowEnd = getSeoulDateTimeString(minutesBefore + 1);

  const [rows] = await pool.query(
    `SELECT DISTINCT
       p.post_id AS roomId,
       p.title,
       p.date,
       p.time,
       p.place,
       members.user_id AS userId
     FROM posts p
     JOIN users author ON author.user_id = p.user_id AND author.is_deleted = FALSE
     JOIN (
       SELECT p2.post_id, p2.user_id
       FROM posts p2
       JOIN users u ON u.user_id = p2.user_id AND u.is_deleted = FALSE
       UNION
       SELECT pp.post_id, pp.user_id
       FROM post_participants pp
       JOIN users u ON u.user_id = pp.user_id AND u.is_deleted = FALSE
     ) members ON members.post_id = p.post_id
     WHERE p.date IS NOT NULL
       AND p.is_deleted = 0
       AND p.time IS NOT NULL
       AND TIMESTAMP(p.date, p.time) >= ?
       AND TIMESTAMP(p.date, p.time) < ?`,
    [windowStart, windowEnd],
  );

  return rows;
};

const sendAppointmentReminders = async (io) => {
  try {
    for (const minutesBefore of REMINDER_INTERVALS) {
      const reminders = await getUpcomingAppointmentReminders(minutesBefore);

      reminders.forEach((row) => {
        io.to(`user_${row.userId}`).emit("appointment_reminder", {
          id: `reminder:${row.roomId}:${minutesBefore}`,
          type: "appointment",
          roomId: row.roomId,
          title: row.title || "약속",
          date: row.date,
          time: row.time,
          place: row.place,
          remainingMinutes: minutesBefore,
        });
      });

      if (reminders.length > 0) {
        console.log(`Sent ${minutesBefore}min reminders to ${reminders.length} user(s).`);
      }
    }
  } catch (error) {
    console.error("Error sending appointment reminders:", error);
  }
};

export const startAppointmentReminderJob = (io) => {
  cron.schedule("* * * * *", () => sendAppointmentReminders(io), {
    scheduled: true,
    timezone: TIMEZONE,
  });

  console.log("Appointment reminder job started.");
};
