/**
 * Middleware de logging para requests HTTP
 * Registra todas las peticiones con información detallada
 */

const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Middleware de logging de requests
 * Registra información detallada de cada petición HTTP
 */
const requestLogger = (req, res, next) => {
  // Generar ID único para la request
  const requestId = uuidv4();
  req.requestId = requestId;

  // Información inicial del request
  const startTime = Date.now();
  const requestInfo = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    userId: null, // Se actualizará después de autenticación
    timestamp: new Date().toISOString()
  };

  // Log inicial del request
  logger.info('📥 HTTP Request iniciado', requestInfo);

  // Capturar el body del request (sin passwords)
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitizedBody = sanitizeLogData(req.body);
    logger.debug('📝 Request Body', { requestId, body: sanitizedBody });
  }

  // Capturar query parameters
  if (req.query && Object.keys(req.query).length > 0) {
    logger.debug('🔍 Query Params', { requestId, query: req.query });
  }

  // Interceptar el método res.json para capturar la respuesta
  const originalJson = res.json;
  const originalSend = res.send;
  const originalEnd = res.end;

  let responseBody = null;
  let responseSent = false;

  // Override res.json
  res.json = function(data) {
    if (!responseSent) {
      responseBody = data;
      responseSent = true;
    }
    return originalJson.call(this, data);
  };

  // Override res.send
  res.send = function(data) {
    if (!responseSent) {
      responseBody = data;
      responseSent = true;
    }
    return originalSend.call(this, data);
  };

  // Override res.end para capturar cuando se complete la respuesta
  res.end = function(chunk, encoding) {
    if (!responseSent && chunk) {
      responseBody = chunk;
      responseSent = true;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Información de la respuesta
    const responseInfo = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      userId: req.usuario?.id || null,
      timestamp: new Date().toISOString()
    };

    // Log de respuesta según el status code
    if (res.statusCode >= 500) {
      logger.error('📤 HTTP Response - Error del servidor', responseInfo);
    } else if (res.statusCode >= 400) {
      logger.warn('📤 HTTP Response - Error del cliente', responseInfo);
    } else {
      logger.info('📤 HTTP Response - Exitoso', responseInfo);
    }

    // Log del response body en desarrollo (sin datos sensibles)
    if (process.env.NODE_ENV === 'development' && responseBody) {
      const sanitizedResponse = sanitizeLogData(responseBody);
      logger.debug('📋 Response Body', { 
        requestId, 
        body: sanitizedResponse,
        truncated: JSON.stringify(sanitizedResponse).length > 1000
      });
    }

    // Log de requests lentos
    if (duration > 5000) { // Más de 5 segundos
      logger.warn('🐌 Request lento detectado', {
        requestId,
        method: req.method,
        url: req.originalUrl,
        duration: `${duration}ms`,
        userId: req.usuario?.id || null
      });
    }

    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Middleware para actualizar el userId en los logs después de autenticación
 */
const updateUserInLogs = (req, res, next) => {
  if (req.usuario && req.requestId) {
    logger.debug('👤 Usuario autenticado en request', {
      requestId: req.requestId,
      userId: req.usuario.id,
      userEmail: req.usuario.email,
      userRole: req.usuario.rol
    });
  }
  next();
};

/**
 * Middleware para logging de operaciones específicas
 */
const operationLogger = (operation) => {
  return (req, res, next) => {
    logger.info(`🔧 Operación: ${operation}`, {
      requestId: req.requestId,
      userId: req.usuario?.id,
      operation,
      params: req.params,
      timestamp: new Date().toISOString()
    });
    next();
  };
};

/**
 * Middleware para logging de errores de validación
 */
const validationLogger = (req, res, next) => {
  const originalStatus = res.status;
  
  res.status = function(code) {
    if (code === 400) {
      logger.warn('⚠️ Error de validación', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        userId: req.usuario?.id || null,
        body: sanitizeLogData(req.body),
        timestamp: new Date().toISOString()
      });
    }
    return originalStatus.call(this, code);
  };
  
  next();
};

/**
 * Middleware para logging de accesos denegados
 */
const accessLogger = (req, res, next) => {
  const originalStatus = res.status;
  
  res.status = function(code) {
    if (code === 403) {
      logger.warn('🚫 Acceso denegado', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        userId: req.usuario?.id || null,
        userRole: req.usuario?.rol || null,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }
    return originalStatus.call(this, code);
  };
  
  next();
};

/**
 * Sanitizar datos sensibles para logging
 */
const sanitizeLogData = (data) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveFields = [
    'password', 'token', 'accessToken', 'refreshToken', 
    'secret', 'key', 'auth', 'authorization',
    'datosBase64' // Para firmas digitales
  ];

  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value);
    } else if (typeof value === 'string' && value.length > 200) {
      // Truncar strings muy largos
      sanitized[key] = value.substring(0, 200) + '... [TRUNCATED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

/**
 * Middleware para logging de uploads de archivos
 */
const uploadLogger = (req, res, next) => {
  if (req.file) {
    logger.info('📁 Archivo subido', {
      requestId: req.requestId,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      userId: req.usuario?.id,
      timestamp: new Date().toISOString()
    });
  }

  if (req.files && req.files.length > 0) {
    logger.info('📁 Múltiples archivos subidos', {
      requestId: req.requestId,
      fileCount: req.files.length,
      totalSize: req.files.reduce((total, file) => total + file.size, 0),
      files: req.files.map(file => ({
        fileName: file.filename,
        originalName: file.originalname,
        size: file.size
      })),
      userId: req.usuario?.id,
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Middleware para logging de rate limiting
 */
const rateLimitLogger = (req, res, next) => {
  // Verificar si se está acercando al límite
  if (req.rateLimit) {
    const { limit, current, remaining, resetTime } = req.rateLimit;
    const percentageUsed = (current / limit) * 100;

    if (percentageUsed > 80) {
      logger.warn('⚡ Rate limit - Uso alto', {
        requestId: req.requestId,
        ip: req.ip,
        userId: req.usuario?.id || null,
        current,
        limit,
        remaining,
        percentageUsed: Math.round(percentageUsed),
        resetTime: new Date(resetTime).toISOString(),
        timestamp: new Date().toISOString()
      });
    }
  }

  next();
};

/**
 * Generar resumen de estadísticas de requests
 */
const generateRequestStats = () => {
  const stats = {
    totalRequests: 0,
    requestsByMethod: {},
    requestsByStatus: {},
    averageResponseTime: 0,
    errorRate: 0,
    timestamp: new Date().toISOString()
  };

  // Esta función sería llamada periódicamente por un cron job
  logger.info('📊 Estadísticas de requests', stats);
  return stats;
};

module.exports = {
  requestLogger,
  updateUserInLogs,
  operationLogger,
  validationLogger,
  accessLogger,
  uploadLogger,
  rateLimitLogger,
  sanitizeLogData,
  generateRequestStats
};