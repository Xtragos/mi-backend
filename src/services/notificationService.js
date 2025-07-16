/**
 * Servicio de notificaciones
 * Maneja creación y envío de notificaciones del sistema
 */

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');
const emailService = require('./emailService');

const prisma = new PrismaClient();

class NotificationService {
  /**
   * Crear notificación en base de datos
   * @param {string} usuarioId - ID del usuario destinatario
   * @param {string} titulo - Título de la notificación
   * @param {string} contenido - Contenido de la notificación
   * @param {string} tipo - Tipo de notificación
   * @param {string} ticketId - ID del ticket relacionado (opcional)
   */
  async crearNotificacion(usuarioId, titulo, contenido, tipo = 'INFO', ticketId = null) {
    try {
      const notificacion = await prisma.notificacion.create({
        data: {
          usuarioId,
          titulo,
          contenido,
          tipo,
          ticketId
        }
      });

      logger.info(`🔔 Notificación creada para usuario ${usuarioId}: ${titulo}`);
      return notificacion;
    } catch (error) {
      logger.error('❌ Error creando notificación:', error);
      throw error;
    }
  }

  /**
   * Notificar nuevo ticket a jefes de departamento
   * @param {Object} ticket - Datos del ticket
   */
  async notificarNuevoTicket(ticket) {
    try {
      // Obtener jefes del departamento
      const jefes = await prisma.usuario.findMany({
        where: {
          rol: 'JEFE_DEPARTAMENTO',
          departamentoId: ticket.departamentoId,
          estaActivo: true
        }
      });

      // Obtener admins
      const admins = await prisma.usuario.findMany({
        where: {
          rol: 'ADMIN',
          estaActivo: true
        }
      });

      const destinatarios = [...jefes, ...admins];

      // Crear notificaciones en base de datos
      for (const destinatario of destinatarios) {
        await this.crearNotificacion(
          destinatario.id,
          `Nuevo ticket: ${ticket.numeroTicket}`,
          `Se ha creado un nuevo ticket "${ticket.asunto}" en el departamento ${ticket.departamento.nombre}`,
          'INFO',
          ticket.id
        );
      }

      // Enviar email a los destinatarios
      const emails = destinatarios.map(d => d.email);
      if (emails.length > 0) {
        await emailService.enviarNotificacionNuevoTicket(ticket, emails);
      }

      logger.info(`🔔 Notificaciones de nuevo ticket enviadas a ${destinatarios.length} usuarios`);

    } catch (error) {
      logger.error('❌ Error notificando nuevo ticket:', error);
      // No lanzar error para no afectar la creación del ticket
    }
  }

  /**
   * Notificar asignación de ticket
   * @param {Object} ticket - Datos del ticket
   * @param {Object} agente - Datos del agente asignado
   */
  async notificarAsignacionTicket(ticket, agente) {
    try {
      await this.crearNotificacion(
        agente.id,
        `Ticket asignado: ${ticket.numeroTicket}`,
        `Se le ha asignado el ticket "${ticket.asunto}"`,
        'INFO',
        ticket.id
      );

      // Notificar también al cliente
      await this.crearNotificacion(
        ticket.creadorId,
        `Ticket asignado: ${ticket.numeroTicket}`,
        `Su ticket "${ticket.asunto}" ha sido asignado a ${agente.nombreCompleto}`,
        'INFO',
        ticket.id
      );

      logger.info(`🔔 Notificación de asignación enviada a agente ${agente.nombreCompleto}`);

    } catch (error) {
      logger.error('❌ Error notificando asignación:', error);
    }
  }

  /**
   * Notificar cambio de estado
   * @param {Object} ticket - Datos del ticket
   * @param {string} estadoAnterior - Estado anterior
   * @param {string} estadoNuevo - Estado nuevo
   */
  async notificarCambioEstado(ticket, estadoAnterior, estadoNuevo) {
    try {
      // Notificar al cliente
      await this.crearNotificacion(
        ticket.creadorId,
        `Ticket actualizado: ${ticket.numeroTicket}`,
        `El estado de su ticket "${ticket.asunto}" ha cambiado de ${estadoAnterior} a ${estadoNuevo}`,
        estadoNuevo === 'CERRADO' ? 'EXITO' : 'INFO',
        ticket.id
      );

      // Si se resuelve o cierra, enviar email con PDF
      if (estadoNuevo === 'CERRADO') {
        try {
          const pdfService = require('./pdfService');
          const pdfBuffer = await pdfService.generarReporteTicket(ticket);
          await emailService.enviarReporteTicket(ticket, pdfBuffer);
        } catch (pdfError) {
          logger.error('❌ Error enviando PDF:', pdfError);
        }
      }

      logger.info(`🔔 Notificación de cambio de estado enviada para ticket ${ticket.numeroTicket}`);

    } catch (error) {
      logger.error('❌ Error notificando cambio de estado:', error);
    }
  }

  /**
   * Notificar nuevo comentario
   * @param {Object} ticket - Datos del ticket
   * @param {Object} comentario - Datos del comentario
   * @param {Object} autor - Datos del autor del comentario
   */
  async notificarNuevoComentario(ticket, comentario, autor) {
    try {
      const destinatarios = [];

      // Agregar creador del ticket (si no es el autor del comentario)
      if (ticket.creadorId !== autor.id) {
        destinatarios.push(ticket.creadorId);
      }

      // Agregar agente asignado (si no es el autor del comentario)
      if (ticket.agenteId && ticket.agenteId !== autor.id) {
        destinatarios.push(ticket.agenteId);
      }

      // Crear notificaciones
      for (const destinatarioId of destinatarios) {
        await this.crearNotificacion(
          destinatarioId,
          `Nuevo comentario: ${ticket.numeroTicket}`,
          `${autor.nombreCompleto} ha agregado un comentario al ticket "${ticket.asunto}"`,
          'INFO',
          ticket.id
        );
      }

      logger.info(`🔔 Notificaciones de nuevo comentario enviadas para ticket ${ticket.numeroTicket}`);

    } catch (error) {
      logger.error('❌ Error notificando nuevo comentario:', error);
    }
  }

  /**
   * Limpiar notificaciones antiguas (ejecutar periódicamente)
   * @param {number} diasAntiguedad - Días de antigüedad para limpiar
   */
  async limpiarNotificacionesAntiguas(diasAntiguedad = 30) {
    try {
      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - diasAntiguedad);

      const resultado = await prisma.notificacion.deleteMany({
        where: {
          creadoEn: {
            lt: fechaLimite
          },
          esLeida: true
        }
      });

      logger.info(`🧹 ${resultado.count} notificaciones antiguas eliminadas`);
      return resultado.count;

    } catch (error) {
      logger.error('❌ Error limpiando notificaciones antiguas:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();