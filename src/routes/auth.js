/**
 * Rutas de autenticación
 * Maneja login, logout, registro y gestión de tokens
 */

const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/login
 * Iniciar sesión de usuario
 */
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email válido requerido'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Contraseña debe tener al menos 6 caracteres')
], authController.login);

/**
 * POST /api/auth/logout
 * Cerrar sesión (requiere autenticación)
 */
router.post('/logout', authenticate, authController.logout);

/**
 * POST /api/auth/refresh
 * Renovar token de acceso
 */
router.post('/refresh', [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token requerido')
], authController.refresh);

/**
 * GET /api/auth/profile
 * Obtener perfil del usuario actual
 */
router.get('/profile', authenticate, authController.getProfile);

/**
 * GET /api/auth/verify
 * Verificar si el token es válido (para Nginx auth_request)
 */
router.get('/verify', authenticate, (req, res) => {
  res.status(200).json({ valid: true });
});

module.exports = router;