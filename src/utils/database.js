/**
 * Utilidad de conexión a base de datos
 * Maneja la conexión con Prisma
 */

const { PrismaClient } = require('@prisma/client');
const { logger } = require('./logger');

let prisma;

/**
 * Conectar a la base de datos
 */
const connectDatabase = async () => {
  try {
    if (!prisma) {
      prisma = new PrismaClient({
        log: [
          { level: 'error', emit: 'event' },
          { level: 'warn', emit: 'event' },
        ],
      });

      // Event listeners para logs de Prisma
      prisma.$on('error', (e) => {
        logger.error('❌ Prisma Error:', e);
      });

      prisma.$on('warn', (e) => {
        logger.warn('⚠️ Prisma Warning:', e);
      });
    }

    // Probar conexión
    await prisma.$connect();
    logger.info('✅ Conexión a base de datos establecida');
    
    return prisma;
  } catch (error) {
    logger.error('❌ Error conectando a base de datos:', error);
    throw error;
  }
};

/**
 * Desconectar de la base de datos
 */
const disconnectDatabase = async () => {
  try {
    if (prisma) {
      await prisma.$disconnect();
      logger.info('✅ Conexión a base de datos cerrada');
    }
  } catch (error) {
    logger.error('❌ Error cerrando conexión:', error);
  }
};

/**
 * Obtener instancia de Prisma
 */
const getPrismaInstance = () => {
  if (!prisma) {
    throw new Error('Base de datos no conectada. Llame a connectDatabase() primero.');
  }
  return prisma;
};

module.exports = {
  connectDatabase,
  disconnectDatabase,
  getPrismaInstance
};