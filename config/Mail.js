import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";

const templatePath = path.join(process.cwd(), "config/email.html");
let emailTemplate = fs.readFileSync(templatePath, "utf8");

const transporter = nodemailer.createTransport({
  // service: "Gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendMail = async (to, otp) => {
  try {
    const htmlContent = emailTemplate.replace("{{OTP}}", otp);

    await transporter.sendMail({
      from: process.env.EMAIL,
      to,
      subject: "Reset Your Password",
      html: htmlContent,
    });

    return true;
  } catch (error) {
    console.error("Email sending error:", error);
    return false;
  }
};
export default sendMail;
