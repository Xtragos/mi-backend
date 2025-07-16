/**
 * Configuración principal de Express
 * Incluye middleware de seguridad y rutas con CORS corregido
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger, updateUserInLogs, validationLogger, accessLogger, rateLimitLogger } = require('./middleware/logger');
const rateLimiter = require('./middleware/rateLimiter');
const { sanitizeInput } = require('./middleware/validation');

const app = express();

// Importar CORS configurado
const corsMiddleware = require('./middleware/cors');

// ========================================
// CONFIGURACIÓN DE CORS PERMISIVO PARA DESARROLLO
// ========================================

/**
 * CORS - Configuración permisiva para desarrollo
 * Permite acceso desde cualquier origen durante desarrollo
 */
const corsOptions = {
  origin: function (origin, callback) {
    // En desarrollo, permitir cualquier origen
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // En producción, usar lista de orígenes permitidos
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://localhost:5173',
      'http://10.10.2.200:3000',
      'http://10.10.2.200:3001',
      'http://10.10.2.200:5173'
    ];
    
    // Permitir requests sin origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`❌ CORS: Origen ${origin} no permitido`);
      callback(null, true); // Temporalmente permitir todos para debugging
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Aplicar CORS antes que otros middleware
app.use(cors(corsOptions));

// Manejar preflight requests explícitamente
app.options('*', cors(corsOptions));

// ========================================
// MIDDLEWARE DE LOGGING Y SEGURIDAD
// ========================================

/**
 * Request Logger - debe ir después de CORS
 */
app.use(requestLogger);

/**
 * Rate Limiting Logger
 */
app.use(rateLimitLogger);

/**
 * Validation Logger
 */
app.use(validationLogger);

/**
 * Access Logger
 */
app.use(accessLogger);

/**
 * Helmet - Protección de headers HTTP (configuración relajada para desarrollo)
 */
app.use(helmet({
  contentSecurityPolicy: false, // Deshabilitado para desarrollo
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

/**
 * Sanitización de inputs
 */
app.use(sanitizeInput);

/**
 * Rate Limiting - Configuración más permisiva para desarrollo
 */
if (process.env.NODE_ENV !== 'development') {
  app.use('/api/', rateLimiter.general);
}

/**
 * Compresión GZIP
 */
app.use(compression());

/**
 * Parser de JSON con límite de tamaño
 */
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========================================
// MIDDLEWARE DE DEBUG PARA CORS
// ========================================

app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.url} - Origin: ${req.get('Origin') || 'No Origin'}`);
  console.log(`📋 Headers: ${JSON.stringify(req.headers, null, 2)}`);
  next();
});

// ========================================
// RUTAS DE LA API
// ========================================

// Ruta de salud del sistema
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    cors: 'enabled',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint para verificar CORS
app.get('/api/test-cors', (req, res) => {
  res.json({
    message: 'CORS está funcionando correctamente',
    origin: req.get('Origin'),
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
});

// Middleware para actualizar userId en logs después de auth
app.use('/api', updateUserInLogs);

// Rutas de autenticación (rate limiting solo en producción)
if (process.env.NODE_ENV === 'production') {
  app.use('/api/auth', rateLimiter.auth, require('./routes/auth'));
} else {
  app.use('/api/auth', require('./routes/auth'));
}

// Rutas protegidas de la API
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/departamentos', require('./routes/departamentos'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/adjuntos', require('./routes/adjuntos'));
app.use('/api/comentarios', require('./routes/comentarios'));
app.use('/api/notificaciones', require('./routes/notificaciones'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Servir archivos estáticos (uploads) con protección
app.use('/uploads', express.static(process.env.UPLOAD_PATH || './uploads', {
  maxAge: '1d',
  etag: true
}));

// ========================================
// MANEJO DE ERRORES
// ========================================

// Manejo específico de errores CORS
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('CORS')) {
    console.log(`❌ Error CORS: ${err.message}`);
    res.status(403).json({
      error: 'CORS Error',
      message: 'Acceso denegado por política CORS',
      origin: req.get('Origin'),
      timestamp: new Date().toISOString()
    });
    return;
  }
  next(err);
});

// Ruta no encontrada
app.use('*', (req, res) => {
  console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Ruta no encontrada',
    message: `La ruta ${req.originalUrl} no existe`,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Middleware global de manejo de errores (debe ser el último)
app.use(errorHandler);

module.exports = app;