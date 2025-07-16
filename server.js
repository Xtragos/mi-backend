/**
 * Servidor principal del sistema Help Desk
 * Configurado con las mejores prácticas de seguridad
 */

require('dotenv').config();
const app = require('./src/app');
const { logger } = require('./src/utils/logger');
const { connectDatabase } = require('./src/utils/database');

const PORT = process.env.PORT || 3000;

/**
 * Inicialización del servidor
 * - Conecta a la base de datos
 * - Inicia el servidor HTTP
 * - Configura manejo de errores
 */
const startServer = async () => {
  try {
    // Conectar a la base de datos
    await connectDatabase();
    logger.info('✅ Conexión a la base de datos establecida');

    // Iniciar servidor
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Servidor iniciado en puerto ${PORT}`);
      logger.info(`📍 Acceso local: http://localhost:${PORT}`);
      logger.info(`🌐 Acceso remoto: http://10.10.2.200:${PORT}`);
    });

    // Configurar Socket.IO para notificaciones en tiempo real
    const io = require('socket.io')(server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || "*",
        methods: ["GET", "POST"]
      }
    });

    // Almacenar io en app para uso global
    app.set('socketio', io);

    // Manejo de conexiones WebSocket
    io.on('connection', (socket) => {
      logger.info(`👤 Cliente conectado: ${socket.id}`);
      
      // Unir a sala por rol de usuario
      socket.on('join_role', (role) => {
        socket.join(role);
        logger.info(`👤 Usuario unido a sala: ${role}`);
      });

      socket.on('disconnect', () => {
        logger.info(`👤 Cliente desconectado: ${socket.id}`);
      });
    });

    // Manejo de señales del sistema
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    function gracefulShutdown() {
      logger.info('🔄 Iniciando cierre ordenado del servidor...');
      server.close(() => {
        logger.info('✅ Servidor cerrado correctamente');
        process.exit(0);
      });
    }

  } catch (error) {
    logger.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();