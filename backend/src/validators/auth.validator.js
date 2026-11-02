const { z, password, email } = require('./common.validator');

const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email, registration or staff number').max(100),
  password: z.string().min(1, 'Password is required').max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});

const forgotPasswordSchema = z.object({ email });

const resetPasswordSchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
  newPassword: password,
});

module.exports = { loginSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema };
