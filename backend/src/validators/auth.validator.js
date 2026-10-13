const { z, password, email } = require('./common.validator');

const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email, registration or staff number'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});

const forgotPasswordSchema = z.object({ email });

const resetPasswordSchema = z.object({
  email,
  token: z.string().min(20, 'Reset token is invalid'),
  newPassword: password,
});

module.exports = { loginSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema };
