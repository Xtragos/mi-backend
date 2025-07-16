/**
 * Middleware global de manejo de errores
 * Captura y procesa todos los errores de la aplicación
 */

const { logger } = require('../utils/logger');
const { PrismaClientKnownRequestError, PrismaClientValidationError } = require('@prisma/client');

/**
 * Middleware global de manejo de errores
 * Debe ser el último middleware en la cadena
 */
const errorHandler = (error, req, res, next) => {
  // Log del error completo para debugging
  logger.error('❌ Error capturado por errorHandler:', {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    userId: req.usuario?.id || null,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Determinar tipo de error y respuesta apropiada
  let statusCode = 500;
  let errorResponse = {
    error: 'Error interno del servidor',
    message: 'Ha ocurrido un error inesperado',
    timestamp: new Date().toISOString()
  };

  // Errores de Prisma (Base de datos)
  if (error instanceof PrismaClientKnownRequestError) {
    statusCode = 400;
    errorResponse = handlePrismaError(error);
  }
  // Errores de validación de Prisma
  else if (error instanceof PrismaClientValidationError) {
    statusCode = 400;
    errorResponse = {
      error: 'Error de validación',
      message: 'Los datos no cumplen con el esquema requerido',
      timestamp: new Date().toISOString()
    };
  }
  // Errores de JWT
  else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorResponse = {
      error: 'Token inválido',
      message: 'El token de autenticación no es válido',
      timestamp: new Date().toISOString()
    };
  }
  else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    errorResponse = {
      error: 'Token expirado',
      message: 'El token de autenticación ha expirado',
      timestamp: new Date().toISOString()
    };
  }
  // Errores de validación de express-validator
  else if (error.name === 'ValidationError') {
    statusCode = 400;
    errorResponse = {
      error: 'Error de validación',
      message: error.message,
      timestamp: new Date().toISOString()
    };
  }
  // Errores de Multer (upload de archivos)
  else if (error.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    errorResponse = {
      error: 'Archivo demasiado grande',
      message: 'El archivo excede el tamaño máximo permitido',
      timestamp: new Date().toISOString()
    };
  }
  else if (error.code === 'LIMIT_FILE_COUNT') {
    statusCode = 400;
    errorResponse = {
      error: 'Demasiados archivos',
      message: 'Se excedió el número máximo de archivos permitidos',
      timestamp: new Date().toISOString()
    };
  }
  else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    errorResponse = {
      error: 'Campo de archivo inesperado',
      message: 'El archivo se envió en un campo no esperado',
      timestamp: new Date().toISOString()
    };
  }
  // Errores de sintaxis JSON
  else if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    statusCode = 400;
    errorResponse = {
      error: 'JSON inválido',
      message: 'El formato JSON enviado no es válido',
      timestamp: new Date().toISOString()
    };
  }
  // Errores personalizados de la aplicación
  else if (error.statusCode) {
    statusCode = error.statusCode;
    errorResponse = {
      error: error.name || 'Error de aplicación',
      message: error.message,
      timestamp: new Date().toISOString()
    };
  }
  // Errores de base de datos de conexión
  else if (error.code === 'ECONNREFUSED') {
    statusCode = 503;
    errorResponse = {
      error: 'Servicio no disponible',
      message: 'No se puede conectar a la base de datos',
      timestamp: new Date().toISOString()
    };
  }
  // Errores de timeout
  else if (error.code === 'ETIMEDOUT') {
    statusCode = 504;
    errorResponse = {
      error: 'Timeout',
      message: 'La operación tardó demasiado tiempo en completarse',
      timestamp: new Date().toISOString()
    };
  }

  // En desarrollo, incluir detalles adicionales
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.details = {
      name: error.name,
      code: error.code,
      originalMessage: error.message
    };
  }

  // Incrementar métricas de errores (si tienes un sistema de métricas)
  if (global.errorMetrics) {
    global.errorMetrics.increment(`error.${statusCode}`);
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Manejar errores específicos de Prisma
 */
const handlePrismaError = (error) => {
  const timestamp = new Date().toISOString();

  switch (error.code) {
    case 'P2002':
      // Violación de restricción única
      const target = error.meta?.target;
      const field = Array.isArray(target) ? target[0] : target;
      return {
        error: 'Valor duplicado',
        message: `Ya existe un registro con este ${field || 'valor'}`,
        timestamp
      };

    case 'P2014':
      // Violación de relación requerida
      return {
        error: 'Relación inválida',
        message: 'El registro referenciado no existe',
        timestamp
      };

    case 'P2003':
      // Violación de clave foránea
      return {
        error: 'Referencia inválida',
        message: 'No se puede realizar la operación porque violaría una restricción de integridad',
        timestamp
      };

    case 'P2025':
      // Registro no encontrado
      return {
        error: 'Registro no encontrado',
        message: 'El registro solicitado no existe',
        timestamp
      };

    case 'P2016':
      // Error de interpretación de consulta
      return {
        error: 'Consulta inválida',
        message: 'La consulta no pudo ser interpretada',
        timestamp
      };

    case 'P2021':
      // Tabla no existe
      return {
        error: 'Tabla no encontrada',
        message: 'La tabla solicitada no existe en la base de datos',
        timestamp
      };

    case 'P2022':
      // Columna no existe
      return {
        error: 'Columna no encontrada',
        message: 'La columna solicitada no existe',
        timestamp
      };

    default:
      return {
        error: 'Error de base de datos',
        message: 'Ha ocurrido un error al acceder a la base de datos',
        timestamp
      };
  }
};

/**
 * Middleware para manejar rutas no encontradas (404)
 */
const notFoundHandler = (req, res) => {
  logger.warn('🔍 Ruta no encontrada:', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Ruta no encontrada',
    message: `La ruta ${req.method} ${req.originalUrl} no existe`,
    timestamp: new Date().toISOString()
  });
};

/**
 * Middleware para manejar errores asíncronos
 * Envuelve controladores async para capturar errores automáticamente
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Clase personalizada para errores de la aplicación
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Crear errores comunes de forma fácil
 */
const createError = {
  badRequest: (message = 'Solicitud inválida') => new AppError(message, 400),
  unauthorized: (message = 'No autorizado') => new AppError(message, 401),
  forbidden: (message = 'Acceso denegado') => new AppError(message, 403),
  notFound: (message = 'Recurso no encontrado') => new AppError(message, 404),
  conflict: (message = 'Conflicto') => new AppError(message, 409),
  unprocessable: (message = 'Datos no procesables') => new AppError(message, 422),
  tooManyRequests: (message = 'Demasiadas solicitudes') => new AppError(message, 429),
  internal: (message = 'Error interno del servidor') => new AppError(message, 500),
  serviceUnavailable: (message = 'Servicio no disponible') => new AppError(message, 503)
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
  createError
};