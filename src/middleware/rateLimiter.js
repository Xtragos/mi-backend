/**
 * Middleware de rate limiting
 * Previene ataques de fuerza bruta y abuso de API
 */

const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

/**
 * Rate limiter general para toda la API
 * 100 requests por 15 minutos por IP
 */
const general = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: {
    error: 'Demasiadas peticiones',
    message: 'Ha excedido el límite de peticiones. Intente nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`🚫 Rate limit excedido para IP: ${req.ip}`);
    res.status(429).json({
      error: 'Demasiadas peticiones',
      message: 'Ha excedido el límite de peticiones. Intente nuevamente en 15 minutos.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});

/**
 * Rate limiter estricto para autenticación
 * 5 intentos por 15 minutos por IP
 */
const auth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 5,
  skipSuccessfulRequests: true,
  message: {
    error: 'Demasiados intentos de login',
    message: 'Ha excedido el límite de intentos de inicio de sesión. Intente nuevamente en 15 minutos.'
  },
  handler: (req, res) => {
    logger.warn(`🚫 Rate limit de login excedido para IP: ${req.ip}`);
    res.status(429).json({
      error: 'Demasiados intentos de login',
      message: 'Ha excedido el límite de intentos de inicio de sesión. Intente nuevamente en 15 minutos.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});

/**
 * Rate limiter para uploads
 * 20 uploads por hora por usuario autenticado
 */
const upload = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => {
    // Usar ID de usuario si está autenticado, sino IP
    return req.usuario?.id || req.ip;
  },
  message: {
    error: 'Demasiados uploads',
    message: 'Ha excedido el límite de archivos subidos. Intente nuevamente en 1 hora.'
  }
});

module.exports = {
  general,
  auth,
  upload
};