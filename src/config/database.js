/**
 * Configuración y conexión a PostgreSQL usando Prisma
 * Incluye manejo de errores y reconexión automática
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

/**
 * Configuración del cliente Prisma
 * Incluye logging y manejo de errores
 */
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

/**
 * Event listeners para logging de Prisma
 */
prisma.$on('query', (e) => {
  logger.debug('Prisma Query', {
    query: e.query,
    params: e.params,
    duration: `${e.duration}ms`,
    target: e.target
  });
});

prisma.$on('error', (e) => {
  logger.error('Prisma Error', {
    message: e.message,
    target: e.target
  });
});

prisma.$on('info', (e) => {
  logger.info('Prisma Info', {
    message: e.message,
    target: e.target
  });
});

prisma.$on('warn', (e) => {
  logger.warn('Prisma Warning', {
    message: e.message,
    target: e.target
  });
});

/**
 * Función para conectar a la base de datos
 * Incluye retry logic y validación de conexión
 */
const connectDB = async () => {
  try {
    await prisma.$connect();
    logger.info('Conexión a PostgreSQL establecida correctamente');
    
    // Verificar que la conexión funciona
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Verificación de conexión DB exitosa');
    
    return true;
  } catch (error) {
    logger.error('Error conectando a la base de datos:', error);
    
    // Retry después de 5 segundos
    setTimeout(async () => {
      logger.info('Reintentando conexión a la base de datos...');
      await connectDB();
    }, 5000);
    
    return false;
  }
};

/**
 * Función para desconectar gracefully
 */
const disconnectDB = async () => {
  try {
    await prisma.$disconnect();
    logger.info('Desconexión de PostgreSQL exitosa');
  } catch (error) {
    logger.error('Error desconectando de la base de datos:', error);
  }
};

/**
 * Manejo de cierre graceful de la aplicación
 */
process.on('SIGINT', async () => {
  logger.info('Recibida señal SIGINT, cerrando conexiones...');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Recibida señal SIGTERM, cerrando conexiones...');
  await disconnectDB();
  process.exit(0);
});

module.exports = {
  prisma,
  connectDB,
  disconnectDB
};