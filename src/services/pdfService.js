/**
 * Servicio de generación de PDFs
 * Crea reportes básicos de tickets (sin Puppeteer por ahora)
 */

const { logger } = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class PDFService {
  /**
   * Generar reporte simple de ticket (texto plano por ahora)
   * @param {Object} ticket - Datos del ticket
   * @returns {Buffer} - Buffer del PDF (simulado)
   */
  async generarReporteTicket(ticket) {
    try {
      // Por ahora generar un reporte simple en texto
      // En producción se puede implementar con jsPDF o Puppeteer
      
      const ticketCompleto = await prisma.ticket.findUnique({
        where: { id: ticket.id },
        include: {
          creador: true,
          agente: true,
          departamento: true,
          categoria: true,
          comentarios: {
            include: {
              autor: {
                select: {
                  nombreCompleto: true,
                  rol: true
                }
              }
            },
            orderBy: { creadoEn: 'asc' }
          },
          registrosTrabajo: {
            include: {
              agente: {
                select: {
                  nombreCompleto: true
                }
              }
            },
            orderBy: { fechaTrabajo: 'asc' }
          }
        }
      });

      const fechaGeneracion = new Date().toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Generar contenido del reporte
      const reporteTexto = `
REPORTE DE TICKET
================

Ticket: ${ticketCompleto.numeroTicket}
Generado: ${fechaGeneracion}

INFORMACIÓN GENERAL
==================
Asunto: ${ticketCompleto.asunto}
Estado: ${ticketCompleto.estado}
Prioridad: ${ticketCompleto.prioridad}
Cliente: ${ticketCompleto.creador.nombreCompleto}
Email: ${ticketCompleto.creador.email}
Agente: ${ticketCompleto.agente?.nombreCompleto || 'No asignado'}
Departamento: ${ticketCompleto.departamento.nombre}
Categoría: ${ticketCompleto.categoria.nombre}
Fecha de creación: ${ticketCompleto.creadoEn.toLocaleDateString('es-ES')}
${ticketCompleto.fechaResolucion ? `Fecha de resolución: ${ticketCompleto.fechaResolucion.toLocaleDateString('es-ES')}` : ''}

DESCRIPCIÓN
===========
${ticketCompleto.descripcion}

${ticketCompleto.ubicacion ? `UBICACIÓN\n=========\n${ticketCompleto.ubicacion}\n` : ''}

${ticketCompleto.registrosTrabajo.length > 0 ? `
REGISTRO DE TRABAJO
==================
${ticketCompleto.registrosTrabajo.map(registro => 
  `${registro.fechaTrabajo.toLocaleDateString('es-ES')} - ${registro.agente.nombreCompleto}
Horas: ${registro.horas}
Descripción: ${registro.descripcion}
`).join('\n')}

Total de horas trabajadas: ${ticketCompleto.horasReales || 0}
` : ''}

${ticketCompleto.comentarios.length > 0 ? `
COMENTARIOS
===========
${ticketCompleto.comentarios.map(comentario => 
  `${comentario.creadoEn.toLocaleDateString('es-ES')} ${comentario.creadoEn.toLocaleTimeString('es-ES')} - ${comentario.autor.nombreCompleto} (${comentario.autor.rol})
${comentario.contenido}
`).join('\n')}
` : ''}

---
Sistema Help Desk - Reporte generado automáticamente
© ${new Date().getFullYear()} - Todos los derechos reservados
      `;

      // Convertir a Buffer (simulando PDF)
      const buffer = Buffer.from(reporteTexto, 'utf-8');

      logger.info(`✅ Reporte generado para ticket ${ticketCompleto.numeroTicket}`);
      return buffer;

    } catch (error) {
      logger.error('❌ Error generando reporte:', error);
      // Generar reporte básico de emergencia
      const reporteBasico = `
REPORTE DE TICKET - ${ticket.numeroTicket}
Generado: ${new Date().toLocaleDateString('es-ES')}

Error al generar reporte completo.
Contacte al administrador del sistema.
      `;
      return Buffer.from(reporteBasico, 'utf-8');
    }
  }
}

module.exports = new PDFService();