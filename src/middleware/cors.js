// backend/middleware/cors.js
const cors = require('cors');

const corsOptions = {
  origin: [
    'http://10.10.2.200:3000',   // Backend mismo
    'http://10.10.2.200:5173',   // Frontend Vite dev
    'http://10.10.2.200:4173',   // Frontend Vite preview
    'http://10.10.2.200:3001',   // Frontend alternativo
    'http://10.10.1.87:5173',    // Cliente remoto
    'http://10.10.1.87:4173',    // Cliente remoto preview
    'http://localhost:3000',     // Desarrollo local
    'http://localhost:5173',     // Vite dev local
    'http://localhost:4173',     // Vite preview local
    'http://127.0.0.1:5173',     // Vite dev
    'http://127.0.0.1:4173'      // Vite preview
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: ['Authorization'],
  maxAge: 86400 // 24 horas
};

module.exports = cors(corsOptions);