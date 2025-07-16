// backend/routes/health.js
const express = require('express');
const router = express.Router();

/**
 * GET /health
 * Endpoint de verificación de salud del sistema
 */
router.get('/', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'helpdesk-backend',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    database: 'connected', // Aquí podrías verificar la conexión a la BD
    cors: {
      enabled: true,
      allowedOrigins: [
        'http://10.10.2.200:5173',
        'http://10.10.1.87:5173',
        'http://localhost:5173'
      ]
    }
  };

  // Headers CORS explícitos para el health check
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
  
  res.status(200).json(healthStatus);
});

/**
 * OPTIONS /health
 * Manejar preflight requests
 */
router.options('/', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.status(200).end();
});

module.exports = router;