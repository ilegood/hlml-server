import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const isMailConfigured = () =>
  Boolean(env.mail.host && env.mail.user && env.mail.pass && env.mail.from);

const createTransporter = () =>
  nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: {
      user: env.mail.user,
      pass: env.mail.pass,
    },
  });

export const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  if (!isMailConfigured()) {
    console.info("[password-reset] Mail is not configured. Reset URL:", resetUrl);
    return { sent: false };
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from: env.mail.from,
    to,
    subject: "HLML 비밀번호 재설정",
    text: `아래 링크에서 비밀번호를 재설정해주세요.\n\n${resetUrl}\n\n이 링크는 30분 동안만 사용할 수 있습니다.`,
    html: `
      <p>아래 버튼을 눌러 비밀번호를 재설정해주세요.</p>
      <p><a href="${resetUrl}">비밀번호 재설정</a></p>
      <p>이 링크는 30분 동안만 사용할 수 있습니다.</p>
    `,
  });

  return { sent: true };
};
