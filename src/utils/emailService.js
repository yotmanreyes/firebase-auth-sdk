const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs').promises;

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  async sendEmail(to, subject, template, data = {}) {
    try {
      const templatePath = path.join(__dirname, `../templates/emails/${template}.ejs`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const html = ejs.render(templateContent, { ...data, appName: process.env.APP_NAME });

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || 'Auth Service'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to,
        subject,
        html
      };

      return await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }

  async sendConfirmationEmail(user, token) {
    const confirmUrl = `${process.env.FRONTEND_URL}/confirm-email?token=${token}`;
    return this.sendEmail(
      user.email,
      'Confirma tu correo electrónico',
      'confirm-email',
      { user, confirmUrl }
    );
  }

  async sendPasswordResetEmail(user, token) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    return this.sendEmail(
      user.email,
      'Restablece tu contraseña',
      'reset-password',
      { user, resetUrl }
    );
  }

  async sendWelcomeEmail(user) {
    return this.sendEmail(
      user.email,
      '¡Bienvenido a nuestra plataforma!',
      'welcome',
      { user }
    );
  }
}

module.exports = new EmailService();
