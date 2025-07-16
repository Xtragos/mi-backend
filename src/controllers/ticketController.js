/**
 * Controlador de tickets
 * Maneja CRUD completo de tickets con lógica de negocio
 */

const { PrismaClient } = require('@prisma/client');
const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { generateTicketNumber } = require('../utils/helpers');
const emailService = require('../services/emailService');
const pdfService = require('../services/pdfService');
const notificationService = require('../services/notificationService');

const prisma = new PrismaClient();

/**
 * Crear nuevo ticket
 * POST /api/tickets
 */
const crearTicket = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const {
      asunto,
      descripcion,
      prioridad = 'MEDIA',
      departamentoId,
      categoriaId,
      proyectoId,
      ubicacion,
      coordenadas,
      fechaVencimiento
    } = req.body;

    // Generar número único de ticket
    const numeroTicket = await generateTicketNumber();

    // Crear ticket
    const ticket = await prisma.ticket.create({
      data: {
        numeroTicket,
        asunto,
        descripcion,
        prioridad,
        creadorId: req.usuario.id,
        departamentoId,
        categoriaId,
        proyectoId,
        ubicacion,
        coordenadas,
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null
      },
      include: {
        creador: {
          select: {
            id: true,
            nombreCompleto: true,
            email: true
          }
        },
        departamento: {
          select: {
            id: true,
            nombre: true
          }
        },
        categoria: {
          select: {
            id: true,
            nombre: true,
            color: true
          }
        },
        proyecto: {
          select: {
            id: true,
            nombre: true
          }
        }
      }
    });

    // Crear historial de estado inicial
    await prisma.historialEstado.create({
      data: {
        ticketId: ticket.id,
        estadoNuevo: 'ABIERTO',
        comentario: 'Ticket creado'
      }
    });

    // Notificar a jefes de departamento
    try {
      await notificationService.notificarNuevoTicket(ticket);
    } catch (notificationError) {
      logger.error('❌ Error enviando notificación:', notificationError);
      // No fallar la creación del ticket por error de notificación
    }

    logger.info(`✅ Ticket creado: ${numeroTicket} por ${req.usuario.email}`);

    res.status(201).json({
      message: 'Ticket creado exitosamente',
      ticket
    });

  } catch (error) {
    logger.error('❌ Error creando ticket:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al crear ticket'
    });
  }
};

/**
 * Obtener tickets con filtros y paginación
 * GET /api/tickets
 */
const obtenerTickets = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      estado,
      prioridad,
      departamentoId,
      categoriaId,
      agenteId,
      buscar
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Construir filtros dinámicos
    const where = {};

    // Filtros por rol de usuario
    if (req.usuario.rol === 'CLIENTE') {
      where.creadorId = req.usuario.id;
    } else if (req.usuario.rol === 'AGENTE') {
      where.agenteId = req.usuario.id;
    } else if (req.usuario.rol === 'JEFE_DEPARTAMENTO') {
      where.departamentoId = req.usuario.departamentoId;
    }
    // ADMIN puede ver todos

    // Aplicar filtros adicionales
    if (estado) where.estado = estado;
    if (prioridad) where.prioridad = prioridad;
    if (departamentoId) where.departamentoId = departamentoId;
    if (categoriaId) where.categoriaId = categoriaId;
    if (agenteId) where.agenteId = agenteId;

    // Búsqueda por texto
    if (buscar) {
      where.OR = [
        { numeroTicket: { contains: buscar, mode: 'insensitive' } },
        { asunto: { contains: buscar, mode: 'insensitive' } },
        { descripcion: { contains: buscar, mode: 'insensitive' } }
      ];
    }

    // Obtener tickets con conteo total
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          creador: {
            select: {
              id: true,
              nombreCompleto: true,
              email: true
            }
          },
          agente: {
            select: {
              id: true,
              nombreCompleto: true,
              email: true
            }
          },
          departamento: {
            select: {
              id: true,
              nombre: true,
              color: true
            }
          },
          categoria: {
            select: {
              id: true,
              nombre: true,
              color: true
            }
          },
          _count: {
            select: {
              comentarios: true,
              adjuntos: true
            }
          }
        },
        orderBy: [
          { prioridad: 'desc' },
          { creadoEn: 'desc' }
        ],
        skip: offset,
        take: parseInt(limit)
      }),
      prisma.ticket.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      tickets,
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
    logger.error('❌ Error obteniendo tickets:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener tickets'
    });
  }
};

/**
 * Obtener ticket por ID
 * GET /api/tickets/:id
 */
const obtenerTicketPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        creador: {
          select: {
            id: true,
            nombreCompleto: true,
            email: true,
            telefono: true
          }
        },
        agente: {
          select: {
            id: true,
            nombreCompleto: true,
            email: true,
            telefono: true
          }
        },
        departamento: {
          select: {
            id: true,
            nombre: true,
            color: true
          }
        },
        categoria: {
          select: {
            id: true,
            nombre: true,
            color: true,
            icono: true
          }
        },
        proyecto: {
          select: {
            id: true,
            nombre: true
          }
        },
        comentarios: {
          include: {
            autor: {
              select: {
                id: true,
                nombreCompleto: true,
                rol: true
              }
            }
          },
          orderBy: {
            creadoEn: 'asc'
          }
        },
        adjuntos: {
          include: {
            subidoPor: {
              select: {
                id: true,
                nombreCompleto: true
              }
            }
          },
          orderBy: {
            creadoEn: 'desc'
          }
        },
        registrosTrabajo: {
          include: {
            agente: {
              select: {
                id: true,
                nombreCompleto: true
              }
            }
          },
          orderBy: {
            fechaTrabajo: 'desc'
          }
        },
        firmasDigitales: {
          include: {
            firmante: {
              select: {
                id: true,
                nombreCompleto: true
              }
            }
          },
          orderBy: {
            fechaFirma: 'desc'
          }
        },
        historialEstados: {
          orderBy: {
            cambiadoEn: 'desc'
          }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({
        error: 'Ticket no encontrado'
      });
    }

    res.json({ ticket });

  } catch (error) {
    logger.error('❌ Error obteniendo ticket:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener ticket'
    });
  }
};

/**
 * Actualizar ticket
 * PUT /api/tickets/:id
 */
const actualizarTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const ticket = await prisma.ticket.update({
      where: { id },
      data: updateData,
      include: {
        creador: true,
        agente: true,
        departamento: true,
        categoria: true
      }
    });

    logger.info(`✅ Ticket actualizado: ${ticket.numeroTicket}`);
    res.json({ 
      message: 'Ticket actualizado exitosamente', 
      ticket 
    });

  } catch (error) {
    logger.error('❌ Error actualizando ticket:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al actualizar ticket'
    });
  }
};

/**
 * Eliminar ticket (solo admin)
 * DELETE /api/tickets/:id
 */
const eliminarTicket = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.ticket.delete({
      where: { id }
    });

    logger.info(`✅ Ticket eliminado: ${id}`);
    res.json({
      message: 'Ticket eliminado exitosamente'
    });

  } catch (error) {
    logger.error('❌ Error eliminando ticket:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al eliminar ticket'
    });
  }
};

/**
 * Asignar ticket a agente
 * PATCH /api/tickets/:id/asignar
 */
const asignarTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { agenteId } = req.body;

    // Verificar que el agente existe y está activo
    const agente = await prisma.usuario.findFirst({
      where: {
        id: agenteId,
        rol: { in: ['AGENTE', 'JEFE_DEPARTAMENTO'] },
        estaActivo: true
      }
    });

    if (!agente) {
      return res.status(400).json({
        error: 'Agente inválido',
        message: 'El agente seleccionado no existe o no está activo'
      });
    }

    // Actualizar ticket
    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        agenteId,
        estado: 'EN_PROGRESO'
      },
      include: {
        creador: true,
        agente: true,
        departamento: true,
        categoria: true
      }
    });

    // Crear historial de estado
    await prisma.historialEstado.create({
      data: {
        ticketId: id,
        estadoAnterior: ticket.estado === 'EN_PROGRESO' ? 'ABIERTO' : ticket.estado,
        estadoNuevo: 'EN_PROGRESO',
        comentario: `Ticket asignado a ${agente.nombreCompleto}`
      }
    });

    // Notificar al agente asignado
    try {
      await notificationService.notificarAsignacionTicket(ticket, agente);
    } catch (notificationError) {
      logger.error('❌ Error enviando notificación:', notificationError);
    }

    logger.info(`✅ Ticket ${ticket.numeroTicket} asignado a ${agente.nombreCompleto}`);

    res.json({
      message: 'Ticket asignado exitosamente',
      ticket
    });

  } catch (error) {
    logger.error('❌ Error asignando ticket:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al asignar ticket'
    });
  }
};

/**
 * Cambiar estado del ticket
 * PATCH /api/tickets/:id/estado
 */
const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, comentario } = req.body;

    const estadosValidos = ['ABIERTO', 'EN_PROGRESO', 'EN_ESPERA', 'RESUELTO', 'CERRADO', 'CANCELADO'];
    
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({
        error: 'Estado inválido',
        message: `El estado debe ser uno de: ${estadosValidos.join(', ')}`
      });
    }

    // Obtener ticket actual
    const ticketActual = await prisma.ticket.findUnique({
      where: { id },
      include: {
        creador: true,
        agente: true
      }
    });

    if (!ticketActual) {
      return res.status(404).json({
        error: 'Ticket no encontrado'
      });
    }

    // Preparar datos de actualización
    const updateData = { estado };
    
    if (estado === 'RESUELTO') {
      updateData.fechaResolucion = new Date();
    } else if (estado === 'CERRADO') {
      updateData.fechaCierre = new Date();
    }

    // Actualizar ticket
    const ticket = await prisma.ticket.update({
      where: { id },
      data: updateData,
      include: {
        creador: true,
        agente: true,
        departamento: true,
        categoria: true
      }
    });

    // Crear historial de estado
    await prisma.historialEstado.create({
      data: {
        ticketId: id,
        estadoAnterior: ticketActual.estado,
        estadoNuevo: estado,
        comentario: comentario || `Estado cambiado a ${estado}`
      }
    });

    // Notificar cambio de estado
    try {
      await notificationService.notificarCambioEstado(ticket, ticketActual.estado, estado);
    } catch (notificationError) {
      logger.error('❌ Error enviando notificación:', notificationError);
    }

    logger.info(`✅ Estado del ticket ${ticket.numeroTicket} cambiado a ${estado}`);

    res.json({
      message: 'Estado actualizado exitosamente',
      ticket
    });

  } catch (error) {
    logger.error('❌ Error cambiando estado:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al cambiar estado'
    });
  }
};

/**
 * Agregar registro de trabajo
 * POST /api/tickets/:id/trabajo
 */
const agregarRegistroTrabajo = async (req, res) => {
  try {
    const { id } = req.params;
    const { descripcion, horas, fechaTrabajo } = req.body;

    const registro = await prisma.registroTrabajo.create({
      data: {
        ticketId: id,
        agenteId: req.usuario.id,
        descripcion,
        horas: parseFloat(horas),
        fechaTrabajo: fechaTrabajo ? new Date(fechaTrabajo) : new Date()
      },
      include: {
        agente: {
          select: {
            id: true,
            nombreCompleto: true
          }
        }
      }
    });

    // Actualizar horas reales del ticket
    await prisma.ticket.update({
      where: { id },
      data: {
        horasReales: {
          increment: parseFloat(horas)
        }
      }
    });

    logger.info(`✅ Registro de trabajo agregado al ticket ${id}: ${horas} horas`);

    res.status(201).json({
      message: 'Registro de trabajo agregado exitosamente',
      registro
    });

  } catch (error) {
    logger.error('❌ Error agregando registro de trabajo:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al agregar registro de trabajo'
    });
  }
};

/**
 * Guardar firma digital
 * POST /api/tickets/:id/firma
 */
const guardarFirma = async (req, res) => {
  try {
    const { id } = req.params;
    const { datosBase64, firmanteId } = req.body;

    if (!datosBase64) {
      return res.status(400).json({
        error: 'Datos requeridos',
        message: 'Los datos de la firma son requeridos'
      });
    }

    const firma = await prisma.firmaDigital.create({
      data: {
        ticketId: id,
        firmanteId: firmanteId || req.usuario.id,
        datosBase64
      },
      include: {
        firmante: {
          select: {
            id: true,
            nombreCompleto: true
          }
        }
      }
    });

    logger.info(`✅ Firma digital guardada para ticket ${id}`);

    res.status(201).json({
      message: 'Firma guardada exitosamente',
      firma
    });

  } catch (error) {
    logger.error('❌ Error guardando firma:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al guardar firma'
    });
  }
};

/**
 * Obtener historial de estados
 * GET /api/tickets/:id/historial
 */
const obtenerHistorial = async (req, res) => {
  try {
    const { id } = req.params;

    const historial = await prisma.historialEstado.findMany({
      where: { ticketId: id },
      orderBy: { cambiadoEn: 'desc' }
    });

    res.json({ historial });

  } catch (error) {
    logger.error('❌ Error obteniendo historial:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener historial'
    });
  }
};

/**
 * Generar PDF del ticket
 * GET /api/tickets/:id/pdf
 */
const generarPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        creador: true,
        agente: true,
        departamento: true,
        categoria: true
      }
    });

    if (!ticket) {
      return res.status(404).json({
        error: 'Ticket no encontrado'
      });
    }

    const pdfBuffer = await pdfService.generarReporteTicket(ticket);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticket_${ticket.numeroTicket}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    logger.error('❌ Error generando PDF:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al generar PDF'
    });
  }
};

/**
 * Reabrir ticket cerrado
 * POST /api/tickets/:id/reabrir
 */
const reabrirTicket = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        estado: 'ABIERTO',
        fechaResolucion: null,
        fechaCierre: null
      },
      include: {
        creador: true,
        agente: true,
        departamento: true,
        categoria: true
      }
    });

    // Crear historial
    await prisma.historialEstado.create({
      data: {
        ticketId: id,
        estadoAnterior: 'CERRADO',
        estadoNuevo: 'ABIERTO',
        comentario: `Ticket reabierto por ${req.usuario.nombreCompleto}`
      }
    });

    logger.info(`✅ Ticket reabierto: ${ticket.numeroTicket}`);

    res.json({
      message: 'Ticket reabierto exitosamente',
      ticket
    });
    } catch (error) {
   logger.error('❌ Error reabriendo ticket:', error);
   res.status(500).json({
     error: 'Error interno',
     message: 'Error al reabrir ticket'
   });
 }
};

/**
* Obtener estadísticas generales
* GET /api/tickets/stats/general
*/
const obtenerEstadisticas = async (req, res) => {
 try {
   let whereClause = {};

   // Filtrar por departamento si es jefe de departamento
   if (req.usuario.rol === 'JEFE_DEPARTAMENTO') {
     whereClause.departamentoId = req.usuario.departamentoId;
   }

   const [
     totalTickets,
     ticketsAbiertos,
     ticketsEnProgreso,
     ticketsResueltos,
     ticketsCerrados,
     ticketsPorPrioridad,
     ticketsPorEstado
   ] = await Promise.all([
     prisma.ticket.count({ where: whereClause }),
     prisma.ticket.count({ where: { ...whereClause, estado: 'ABIERTO' } }),
     prisma.ticket.count({ where: { ...whereClause, estado: 'EN_PROGRESO' } }),
     prisma.ticket.count({ where: { ...whereClause, estado: 'RESUELTO' } }),
     prisma.ticket.count({ where: { ...whereClause, estado: 'CERRADO' } }),
     
     // Tickets por prioridad
     prisma.ticket.groupBy({
       by: ['prioridad'],
       where: whereClause,
       _count: { prioridad: true }
     }),
     
     // Tickets por estado
     prisma.ticket.groupBy({
       by: ['estado'],
       where: whereClause,
       _count: { estado: true }
     })
   ]);

   const estadisticas = {
     total: totalTickets,
     abiertos: ticketsAbiertos,
     enProgreso: ticketsEnProgreso,
     resueltos: ticketsResueltos,
     cerrados: ticketsCerrados,
     porPrioridad: ticketsPorPrioridad.reduce((acc, item) => {
       acc[item.prioridad] = item._count.prioridad;
       return acc;
     }, {}),
     porEstado: ticketsPorEstado.reduce((acc, item) => {
       acc[item.estado] = item._count.estado;
       return acc;
     }, {})
   };

   res.json({ estadisticas });

 } catch (error) {
   logger.error('❌ Error obteniendo estadísticas:', error);
   res.status(500).json({
     error: 'Error interno',
     message: 'Error al obtener estadísticas'
   });
 }
};

/**
* Exportar tickets a CSV
* GET /api/tickets/export/csv
*/
const exportarCSV = async (req, res) => {
 try {
   const {
     estado,
     prioridad,
     departamentoId,
     categoriaId,
     fechaInicio,
     fechaFin
   } = req.query;

   let whereClause = {};

   // Filtros por rol
   if (req.usuario.rol === 'JEFE_DEPARTAMENTO') {
     whereClause.departamentoId = req.usuario.departamentoId;
   }

   // Aplicar filtros
   if (estado) whereClause.estado = estado;
   if (prioridad) whereClause.prioridad = prioridad;
   if (departamentoId) whereClause.departamentoId = departamentoId;
   if (categoriaId) whereClause.categoriaId = categoriaId;

   // Filtro por fechas
   if (fechaInicio || fechaFin) {
     whereClause.creadoEn = {};
     if (fechaInicio) whereClause.creadoEn.gte = new Date(fechaInicio);
     if (fechaFin) whereClause.creadoEn.lte = new Date(fechaFin);
   }

   const tickets = await prisma.ticket.findMany({
     where: whereClause,
     include: {
       creador: {
         select: { nombreCompleto: true, email: true }
       },
       agente: {
         select: { nombreCompleto: true }
       },
       departamento: {
         select: { nombre: true }
       },
       categoria: {
         select: { nombre: true }
       }
     },
     orderBy: { creadoEn: 'desc' }
   });

   // Generar CSV
   const csvHeader = 'Número,Asunto,Estado,Prioridad,Cliente,Agente,Departamento,Categoría,Fecha Creación,Fecha Resolución\n';
   const csvData = tickets.map(ticket => [
     ticket.numeroTicket,
     `"${ticket.asunto.replace(/"/g, '""')}"`,
     ticket.estado,
     ticket.prioridad,
     `"${ticket.creador.nombreCompleto}"`,
     `"${ticket.agente?.nombreCompleto || 'Sin asignar'}"`,
     `"${ticket.departamento.nombre}"`,
     `"${ticket.categoria.nombre}"`,
     ticket.creadoEn.toLocaleDateString('es-ES'),
     ticket.fechaResolucion ? ticket.fechaResolucion.toLocaleDateString('es-ES') : ''
   ].join(',')).join('\n');

   const csv = csvHeader + csvData;

   res.setHeader('Content-Type', 'text/csv; charset=utf-8');
   res.setHeader('Content-Disposition', `attachment; filename="tickets_${new Date().toISOString().split('T')[0]}.csv"`);
   res.send('\ufeff' + csv); // BOM para UTF-8

   logger.info(`✅ CSV exportado con ${tickets.length} tickets`);

 } catch (error) {
   logger.error('❌ Error exportando CSV:', error);
   res.status(500).json({
     error: 'Error interno',
     message: 'Error al exportar CSV'
   });
 }
};

/**
* Asignación masiva de tickets
* POST /api/tickets/bulk/assign
*/
const asignacionMasiva = async (req, res) => {
 try {
   const { ticketIds, agenteId } = req.body;

   // Verificar que el agente existe
   const agente = await prisma.usuario.findFirst({
     where: {
       id: agenteId,
       rol: { in: ['AGENTE', 'JEFE_DEPARTAMENTO'] },
       estaActivo: true
     }
   });

   if (!agente) {
     return res.status(400).json({
       error: 'Agente inválido'
     });
   }

   // Actualizar tickets
   const resultado = await prisma.ticket.updateMany({
     where: {
       id: { in: ticketIds },
       estado: { in: ['ABIERTO', 'EN_PROGRESO'] }
     },
     data: {
       agenteId,
       estado: 'EN_PROGRESO'
     }
   });

   logger.info(`✅ ${resultado.count} tickets asignados masivamente a ${agente.nombreCompleto}`);

   res.json({
     message: `${resultado.count} tickets asignados exitosamente`,
     ticketsActualizados: resultado.count
   });

 } catch (error) {
   logger.error('❌ Error en asignación masiva:', error);
   res.status(500).json({
     error: 'Error interno',
     message: 'Error en asignación masiva'
   });
 }
};

/**
* Cambio de estado masivo
* POST /api/tickets/bulk/status
*/
const cambioEstadoMasivo = async (req, res) => {
 try {
   const { ticketIds, estado } = req.body;

   const updateData = { estado };
   
   if (estado === 'RESUELTO') {
     updateData.fechaResolucion = new Date();
   } else if (estado === 'CERRADO') {
     updateData.fechaCierre = new Date();
   }

   const resultado = await prisma.ticket.updateMany({
     where: {
       id: { in: ticketIds }
     },
     data: updateData
   });

   logger.info(`✅ ${resultado.count} tickets cambiados masivamente a estado ${estado}`);

   res.json({
     message: `${resultado.count} tickets actualizados exitosamente`,
     ticketsActualizados: resultado.count
   });

 } catch (error) {
   logger.error('❌ Error en cambio de estado masivo:', error);
   res.status(500).json({
     error: 'Error interno',
     message: 'Error en cambio de estado masivo'
   });
 }
};

module.exports = {
 crearTicket,
 obtenerTickets,
 obtenerTicketPorId,
 actualizarTicket,
 eliminarTicket,
 asignarTicket,
 cambiarEstado,
 agregarRegistroTrabajo,
 guardarFirma,
 obtenerHistorial,
 generarPDF,
 reabrirTicket,
 obtenerEstadisticas,
 exportarCSV,
 asignacionMasiva,
 cambioEstadoMasivo
};