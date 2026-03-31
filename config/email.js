import nodemailer from 'nodemailer';

export const sendEmail = async (to, subject, html) => {
	try {
		// For development, you can use ethereal email (temporary testing)
		// For production, use real SMTP service (Gmail, SendGrid, etc.)
		const transporter = nodemailer.createTransport({
			host: process.env.EMAIL_HOST || 'smtp.gmail.com',
			port: process.env.EMAIL_PORT || 587,
			secure: false, // true for 465, false for other ports
			auth: {
				user: process.env.EMAIL_USER,
				pass: process.env.EMAIL_PASSWORD,
			},
		});

		const mailOptions = {
			from: process.env.EMAIL_FROM || 'Quran Academy <noreply@quranacademy.com>',
			to,
			subject,
			html,
		};

		const info = await transporter.sendMail(mailOptions);
		console.log('Email sent:', info.messageId);
		return info;
	} catch (error) {
		console.error('Email Error:', error);
		throw new Error('Email could not be sent');
	}
};