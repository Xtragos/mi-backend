/**
 * Controlador de notificaciones
 * Maneja el sistema de notificaciones del usuario
 */

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Obtener notificaciones del usuario
 */
const obtenerNotificaciones = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      tipo,
      esLeida
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {
      usuarioId: req.usuario.id
    };

    if (tipo) where.tipo = tipo;
    if (esLeida !== undefined) where.esLeida = esLeida === 'true';

    const [notificaciones, total] = await Promise.all([
      prisma.notificacion.findMany({
        where,
        include: {
          ticket: {
            select: {
              id: true,
              numeroTicket: true,
              asunto: true,
              estado: true
            }
          }
        },
        orderBy: { creadoEn: 'desc' },
        skip: offset,
        take: parseInt(limit)
      }),
      prisma.notificacion.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      notificaciones,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    logger.error('❌ Error obteniendo notificaciones:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener notificaciones'
    });
  }
};

/**
 * Contar notificaciones no leídas
 */
const contarNoLeidas = async (req, res) => {
  try {
    const count = await prisma.notificacion.count({
      where: {
        usuarioId: req.usuario.id,
        esLeida: false
      }
    });

    res.json({ count });

  } catch (error) {
    logger.error('❌ Error contando notificaciones no leídas:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al contar notificaciones'
    });
  }
};

/**
 * Marcar notificación como leída
 */
const marcarComoLeida = async (req, res) => {
  try {
    const { id } = req.params;

    const notificacion = await prisma.notificacion.findFirst({
      where: {
        id,
        usuarioId: req.usuario.id
      }
    });

    if (!notificacion) {
      return res.status(404).json({
        error: 'Notificación no encontrada'
      });
    }

    await prisma.notificacion.update({
      where: { id },
      data: { esLeida: true }
    });

    res.json({
      message: 'Notificación marcada como leída'
    });

  } catch (error) {
    logger.error('❌ Error marcando notificación como leída:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al marcar notificación'
    });
  }
};

/**
 * Marcar todas las notificaciones como leídas
 */
const marcarTodasComoLeidas = async (req, res) => {
  try {
    const result = await prisma.notificacion.updateMany({
      where: {
        usuarioId: req.usuario.id,
        esLeida: false
      },
      data: { esLeida: true }
    });

    res.json({
      message: `${result.count} notificaciones marcadas como leídas`
    });

  } catch (error) {
    logger.error('❌ Error marcando todas las notificaciones como leídas:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al marcar notificaciones'
    });
  }
};

/**
 * Eliminar notificación
 */
const eliminarNotificacion = async (req, res) => {
  try {
    const { id } = req.params;

    const notificacion = await prisma.notificacion.findFirst({
      where: {
        id,
        usuarioId: req.usuario.id
      }
    });

    if (!notificacion) {
      return res.status(404).json({
        error: 'Notificación no encontrada'
      });
    }

    await prisma.notificacion.delete({
      where: { id }
    });

    res.json({
      message: 'Notificación eliminada exitosamente'
    });

  } catch (error) {
    logger.error('❌ Error eliminando notificación:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al eliminar notificación'
    });
  }
};

module.exports = {
  obtenerNotificaciones,
  contarNoLeidas,
  marcarComoLeida,
  marcarTodasComoLeidas,
  eliminarNotificacion
};