const express = require('express');
const router = express.Router();
const { isAdmin, isAuthenticated } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { body, param, query } = require('express-validator');
const {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  updateProfile,
  changePassword
} = require('../controllers/userController');

// Validaciones comunes
const userIdParam = param('id')
  .isString()
  .withMessage('ID de usuario inválido')
  .trim()
  .notEmpty()
  .withMessage('El ID de usuario es requerido');

const emailValidation = body('email')
  .isEmail()
  .withMessage('Correo electrónico inválido')
  .normalizeEmail();

const passwordValidation = body('password')
  .isLength({ min: 8 })
  .withMessage('La contraseña debe tener al menos 8 caracteres')
  .matches(/[0-9]/, 'g')
  .withMessage('La contraseña debe contener al menos un número')
  .matches(/[A-Z]/, 'g')
  .withMessage('La contraseña debe contener al menos una letra mayúscula')
  .matches(/[^A-Za-z0-9]/, 'g')
  .withMessage('La contraseña debe contener al menos un carácter especial');

/**
 * @openapi
 * tags:
 *   name: Users
 *   description: Gestión de usuarios
 */

// Rutas públicas de autenticación
router.post(
  '/auth/request-password-reset',
  [
    body('email')
      .isEmail()
      .withMessage('Correo electrónico inválido')
      .normalizeEmail()
  ],
  validate,
  requestPasswordReset
);

router.post(
  '/auth/reset-password',
  [
    body('token')
      .isString()
      .withMessage('Token inválido')
      .notEmpty()
      .withMessage('El token es requerido'),
    passwordValidation
  ],
  validate,
  resetPassword
);

router.get(
  '/auth/verify-email',
  [
    query('token')
      .isString()
      .withMessage('Token inválido')
      .notEmpty()
      .withMessage('El token es requerido')
  ],
  validate,
  verifyEmail
);

// Rutas protegidas (requieren autenticación)
router.use(isAuthenticated);

// Perfil del usuario actual
router.get('/users/me', getCurrentUser);
router.put(
  '/users/me',
  [
    body('personalInfo.firstName')
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .withMessage('El nombre es requerido'),
    body('personalInfo.lastName')
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .withMessage('El apellido es requerido'),
    body('personalInfo.phone')
      .optional()
      .isString()
      .trim()
      .matches(/^[0-9\-\+\(\)\s]+$/, 'g')
      .withMessage('Número de teléfono inválido'),
    body('preferences')
      .optional()
      .isObject()
      .withMessage('Las preferencias deben ser un objeto')
  ],
  validate,
  updateProfile
);

router.post(
  '/users/me/change-password',
  [
    body('currentPassword')
      .isString()
      .withMessage('Contraseña actual inválida')
      .notEmpty()
      .withMessage('La contraseña actual es requerida'),
    passwordValidation
  ],
  validate,
  changePassword
);

// Rutas de administrador (requieren rol de admin)
router.use(isAdmin);

router.post(
  '/users',
  [
    emailValidation,
    passwordValidation,
    body('role')
      .isIn(['admin', 'doctor', 'patient'])
      .withMessage('Rol inválido'),
    body('displayName')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('El nombre es requerido'),
  ],
  validate,
  createUser
);

router.get('/users', getAllUsers);

router.get(
  '/users/:id',
  [userIdParam],
  validate,
  getUserById
);

router.put(
  '/users/:id',
  [
    userIdParam,
    emailValidation.optional(),
    body('role')
      .optional()
      .isIn(['admin', 'doctor', 'patient'])
      .withMessage('Rol inválido'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'suspended'])
      .withMessage('Estado inválido')
  ],
  validate,
  updateUser
);

router.delete(
  '/users/:id',
  [userIdParam],
  validate,
  deleteUser
);

module.exports = router;
