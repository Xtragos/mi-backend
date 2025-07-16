/**
 * Controlador de comentarios
 * Maneja CRUD de comentarios en tickets
 */

const { PrismaClient } = require('@prisma/client');
const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const notificationService = require('../services/notificationService');

const prisma = new PrismaClient();

/**
 * Crear comentario en ticket
 */
const crearComentario = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const { id: ticketId } = req.params;
    const { contenido, esInterno = false } = req.body;

    // Obtener ticket para notificaciones
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        creador: true,
        agente: true
      }
    });

    if (!ticket) {
      return res.status(404).json({
        error: 'Ticket no encontrado'
      });
    }

    const comentario = await prisma.comentario.create({
      data: {
        contenido,
        esInterno,
        ticketId,
        autorId: req.usuario.id
      },
      include: {
        autor: {
          select: {
            id: true,
            nombreCompleto: true,
            rol: true,
            avatar: true
          }
        }
      }
    });

    // Enviar notificaciones (si no es comentario interno)
    if (!esInterno) {
      await notificationService.notificarNuevoComentario(ticket, comentario, req.usuario);
    }

    logger.info(`✅ Comentario agregado al ticket ${ticket.numeroTicket} por ${req.usuario.email}`);

    res.status(201).json({
      message: 'Comentario agregado exitosamente',
      comentario
    });

  } catch (error) {
    logger.error('❌ Error creando comentario:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al crear comentario'
    });
  }
};

/**
 * Obtener comentario por ID
 */
const obtenerComentarioPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const comentario = await prisma.comentario.findUnique({
      where: { id },
      include: {
        autor: {
          select: {
            id: true,
            nombreCompleto: true,
            rol: true,
            avatar: true
          }
        },
        ticket: {
          select: {
            id: true,
            numeroTicket: true,
            asunto: true,
            creadorId: true,
            agenteId: true,
            departamentoId: true
          }
        }
      }
    });

    if (!comentario) {
      return res.status(404).json({
        error: 'Comentario no encontrado'
      });
    }

    // Verificar permisos de acceso
    const usuario = req.usuario;
    const ticket = comentario.ticket;

    const tieneAcceso = 
      usuario.rol === 'ADMIN' ||
      (usuario.rol === 'JEFE_DEPARTAMENTO' && ticket.departamentoId === usuario.departamentoId) ||
      (usuario.rol === 'AGENTE' && ticket.agenteId === usuario.id) ||
      (usuario.rol === 'CLIENTE' && ticket.creadorId === usuario.id && !comentario.esInterno);

    if (!tieneAcceso) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tiene permisos para ver este comentario'
      });
    }

    res.json({ comentario });

  } catch (error) {
    logger.error('❌ Error obteniendo comentario:', error);
   res.status(500).json({
     error: 'Error interno',
     message: 'Error al obtener comentario'
   });
 }
};

/**
* Editar comentario
*/
const editarComentario = async (req, res) => {
 try {
   const { id } = req.params;
   const { contenido } = req.body;

   const comentarioActual = await prisma.comentario.findUnique({
     where: { id },
     include: {
       autor: {
         select: {
           id: true,
           nombreCompleto: true
         }
       },
       ticket: {
         select: {
           numeroTicket: true
         }
       }
     }
   });

   if (!comentarioActual) {
     return res.status(404).json({
       error: 'Comentario no encontrado'
     });
   }

   // Solo el autor o admin pueden editar
   const puedeEditar = 
     req.usuario.rol === 'ADMIN' ||
     comentarioActual.autorId === req.usuario.id;

   if (!puedeEditar) {
     return res.status(403).json({
       error: 'Acceso denegado',
       message: 'Solo puede editar sus propios comentarios'
     });
   }

   // No permitir editar comentarios muy antiguos (24 horas)
   const horasTranscurridas = (new Date() - comentarioActual.creadoEn) / (1000 * 60 * 60);
   if (horasTranscurridas > 24 && req.usuario.rol !== 'ADMIN') {
     return res.status(400).json({
       error: 'Tiempo excedido',
       message: 'No puede editar comentarios después de 24 horas'
     });
   }

   const comentario = await prisma.comentario.update({
     where: { id },
     data: { 
       contenido,
       actualizadoEn: new Date()
     },
     include: {
       autor: {
         select: {
           id: true,
           nombreCompleto: true,
           rol: true,
           avatar: true
         }
       }
     }
   });

   logger.info(`✅ Comentario editado en ticket ${comentarioActual.ticket.numeroTicket} por ${req.usuario.email}`);

   res.json({
     message: 'Comentario editado exitosamente',
     comentario
   });

 } catch (error) {
   logger.error('❌ Error editando comentario:', error);
   res.status(500).json({
     error: 'Error interno',
     message: 'Error al editar comentario'
   });
 }
};

/**
* Eliminar comentario
*/
const eliminarComentario = async (req, res) => {
 try {
   const { id } = req.params;

   const comentario = await prisma.comentario.findUnique({
     where: { id },
     include: {
       ticket: {
         select: {
           numeroTicket: true
         }
       }
     }
   });

   if (!comentario) {
     return res.status(404).json({
       error: 'Comentario no encontrado'
     });
   }

   // Solo admin o jefe de departamento pueden eliminar
   if (!['ADMIN', 'JEFE_DEPARTAMENTO'].includes(req.usuario.rol)) {
     return res.status(403).json({
       error: 'Acceso denegado',
       message: 'No tiene permisos para eliminar comentarios'
     });
   }

   await prisma.comentario.delete({
     where: { id }
   });

   logger.info(`✅ Comentario eliminado del ticket ${comentario.ticket.numeroTicket} por ${req.usuario.email}`);

   res.json({
     message: 'Comentario eliminado exitosamente'
   });

 } catch (error) {
   logger.error('❌ Error eliminando comentario:', error);
   res.status(500).json({
     error: 'Error interno',
     message: 'Error al eliminar comentario'
   });
 }
};

module.exports = {
 crearComentario,
 obtenerComentarioPorId,
 editarComentario,
 eliminarComentario
};