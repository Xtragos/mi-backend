/**
 * Sistema de logging centralizado
 * Maneja logs de aplicación con diferentes niveles
 */

const winston = require('winston');
const path = require('path');

// Crear directorio de logs si no existe
const logDir = path.dirname(process.env.LOG_FILE || '/var/log/helpdesk/app.log');

// Configurar formatos personalizados
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Crear logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'helpdesk-backend' },
  transports: [
    // Archivo para todos los logs
    new winston.transports.File({
      filename: process.env.LOG_FILE || '/var/log/helpdesk/app.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Archivo separado para errores
    new winston.transports.File({
      filename: process.env.LOG_FILE?.replace('.log', '_error.log') || '/var/log/helpdesk/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ]
});

// Agregar console en desarrollo
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

/**
 * Middleware de logging para Express
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log de request
  logger.info('HTTP Request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.usuario?.id || null
  });

  // Override end para capturar response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    logger.info('HTTP Response', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.usuario?.id || null
    });

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Logger específico para autenticación
 */
const authLogger = {
  loginSuccess: (email, ip, userAgent) => {
    logger.info('Login Success', {
      email,
      ip,
      userAgent,
      timestamp: new Date().toISOString()
    });
  },

  loginFailed: (email, ip, reason) => {
    logger.warn('Login Failed', {
      email,
      ip,
      reason,
      timestamp: new Date().toISOString()
    });
  },

  logout: (email, ip) => {
    logger.info('Logout', {
      email,
      ip,
      timestamp: new Date().toISOString()
    });
  },

  tokenRefresh: (email, ip) => {
    logger.info('Token Refresh', {
      email,
      ip,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Logger específico para operaciones de tickets
 */
const ticketLogger = {
  created: (ticketNumber, creatorEmail, departamento) => {
    logger.info('Ticket Created', {
      ticketNumber,
      creatorEmail,
      departamento,
      timestamp: new Date().toISOString()
    });
  },

  assigned: (ticketNumber, agentEmail, assignedBy) => {
    logger.info('Ticket Assigned', {
      ticketNumber,
      agentEmail,
      assignedBy,
      timestamp: new Date().toISOString()
    });
  },

  statusChanged: (ticketNumber, oldStatus, newStatus, changedBy) => {
    logger.info('Ticket Status Changed', {
      ticketNumber,
      oldStatus,
      newStatus,
      changedBy,
      timestamp: new Date().toISOString()
    });
  },

  closed: (ticketNumber, closedBy, totalHours) => {
    logger.info('Ticket Closed', {
      ticketNumber,
      closedBy,
      totalHours,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Logger para errores de seguridad
 */
const securityLogger = {
  rateLimitExceeded: (ip, endpoint) => {
    logger.warn('Rate Limit Exceeded', {
      ip,
      endpoint,
      timestamp: new Date().toISOString()
    });
  },

  unauthorizedAccess: (ip, endpoint, userId) => {
    logger.warn('Unauthorized Access Attempt', {
      ip,
      endpoint,
      userId,
      timestamp: new Date().toISOString()
    });
  },

  suspiciousActivity: (ip, activity, details) => {
    logger.error('Suspicious Activity', {
      ip,
      activity,
      details,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  logger,
  requestLogger,
  authLogger,
  ticketLogger,
  securityLogger
};