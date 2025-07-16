/**
 * Servicio de envío de emails
 * Maneja notificaciones automáticas y reportes
 */

const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

class EmailService {
  constructor() {
    // Verificar si las variables de entorno están configuradas
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.warn('⚠️ Variables de email no configuradas, modo simulación activado');
      this.simulationMode = true;
      return;
    }

    this.simulationMode = false;
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Verificar conexión
    this.transporter.verify((error, success) => {
      if (error) {
        logger.error('❌ Error configurando email:', error);
        this.simulationMode = true;
      } else {
        logger.info('✅ Servicio de email configurado correctamente');
      }
    });
  }

  /**
   * Enviar reporte de ticket con PDF adjunto
   * @param {Object} ticket - Datos del ticket
   * @param {Buffer} pdfBuffer - Buffer del PDF generado
   */
  async enviarReporteTicket(ticket, pdfBuffer) {
    try {
      if (this.simulationMode) {
        logger.info(`📧 [SIMULACIÓN] Email enviado a ${ticket.creador.email} para ticket ${ticket.numeroTicket}`);
        return;
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@helpdesk.com',
        to: ticket.creador.email,
        subject: `✅ Ticket ${ticket.numeroTicket} - Trabajo Completado`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4299e1;">Ticket Completado</h2>
            <p>Estimado/a <strong>${ticket.creador.nombreCompleto}</strong>,</p>
            
            <p>Su ticket <strong>${ticket.numeroTicket}</strong> ha sido completado exitosamente.</p>
            
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #2d3748;">Detalles del Ticket:</h3>
              <p><strong>Asunto:</strong> ${ticket.asunto}</p>
              <p><strong>Categoría:</strong> ${ticket.categoria?.nombre || 'N/A'}</p>
              <p><strong>Agente:</strong> ${ticket.agente?.nombreCompleto || 'No asignado'}</p>
              <p><strong>Fecha de resolución:</strong> ${ticket.fechaResolucion ? new Date(ticket.fechaResolucion).toLocaleDateString('es-ES') : 'N/A'}</p>
            </div>
            
            <p>Adjunto encontrará el reporte detallado con todas las actividades realizadas.</p>
            
            <p>Gracias por usar nuestro sistema de soporte.</p>
            
            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              Este es un email automático del Sistema Help Desk. No responda a este mensaje.
            </p>
          </div>
        `,
        attachments: pdfBuffer ? [
          {
            filename: `ticket_${ticket.numeroTicket}_reporte.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ] : []
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`📧 Email enviado a ${ticket.creador.email} para ticket ${ticket.numeroTicket}`);

    } catch (error) {
      logger.error('❌ Error enviando email:', error);
      // No lanzar error para no fallar la operación principal
    }
  }

  /**
   * Enviar notificación de nuevo ticket
   * @param {Object} ticket - Datos del ticket
   * @param {Array} destinatarios - Lista de emails destinatarios
   */
  async enviarNotificacionNuevoTicket(ticket, destinatarios) {
    try {
      if (this.simulationMode) {
        logger.info(`📧 [SIMULACIÓN] Notificación de nuevo ticket enviada a ${destinatarios.length} destinatarios`);
        return;
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@helpdesk.com',
        to: destinatarios.join(', '),
        subject: `🎫 Nuevo Ticket: ${ticket.numeroTicket}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e53e3e;">Nuevo Ticket Creado</h2>
            
            <div style="background: #fed7d7; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #c53030;">Ticket #${ticket.numeroTicket}</h3>
              <p><strong>Asunto:</strong> ${ticket.asunto}</p>
              <p><strong>Prioridad:</strong> <span style="background: ${this.getPriorityColor(ticket.prioridad)}; color: white; padding: 2px 8px; border-radius: 4px;">${ticket.prioridad}</span></p>
              <p><strong>Cliente:</strong> ${ticket.creador.nombreCompleto}</p>
              <p><strong>Departamento:</strong> ${ticket.departamento.nombre}</p>
              <p><strong>Categoría:</strong> ${ticket.categoria.nombre}</p>
            </div>
            
            <p><strong>Descripción:</strong></p>
            <p style="background: #f7fafc; padding: 15px; border-radius: 4px;">${ticket.descripcion}</p>
            
            <a href="${process.env.SERVER_URL || 'http://localhost:3000'}/tickets/${ticket.id}" 
               style="background: #4299e1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
              Ver Ticket
            </a>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`📧 Notificación de nuevo ticket enviada a ${destinatarios.length} destinatarios`);

    } catch (error) {
      logger.error('❌ Error enviando notificación:', error);
    }
  }

  /**
   * Obtener color por prioridad
   * @private
   */
  getPriorityColor(prioridad) {
    const colors = {
      'BAJA': '#38a169',
      'MEDIA': '#d69e2e',
      'ALTA': '#e53e3e',
      'URGENTE': '#9c4221'
    };
    return colors[prioridad] || '#4299e1';
  }
}

module.exports = new EmailService();