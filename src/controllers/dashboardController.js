/**
 * Controlador del dashboard
 * Proporciona métricas y estadísticas del sistema
 */

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Obtener estadísticas principales del dashboard
 * GET /api/dashboard/stats
 */
const obtenerEstadisticas = async (req, res) => {
  try {
    const { timeRange = 'week', userId, userRole } = req.query;
    const usuarioActual = req.usuario;

    // Obtener fechas según el rango
    const { startDate, endDate } = getDateRange(timeRange);

    // Construir filtros según el rol del usuario
    const whereClause = buildWhereClause(usuarioActual.rol, usuarioActual.departamentoId, usuarioActual.id);

    // Obtener métricas principales
    const [
      totalTickets,
      ticketsAbiertos,
      ticketsEnProgreso,
      ticketsResueltos,
      ticketsCerrados,
      ticketsPendientes,
      ticketsVencidos,
      promedioResolucion
    ] = await Promise.all([
      // Total de tickets
      prisma.ticket.count({ where: whereClause }),
      
      // Tickets por estado
      prisma.ticket.count({ where: { ...whereClause, estado: 'ABIERTO' } }),
      prisma.ticket.count({ where: { ...whereClause, estado: 'EN_PROGRESO' } }),
      prisma.ticket.count({ where: { ...whereClause, estado: 'RESUELTO' } }),
      prisma.ticket.count({ where: { ...whereClause, estado: 'CERRADO' } }),
      
      // Tickets pendientes (abiertos + en progreso)
      prisma.ticket.count({ 
        where: { 
          ...whereClause, 
          estado: { in: ['ABIERTO', 'EN_PROGRESO'] } 
        } 
      }),
      
      // Tickets vencidos
      prisma.ticket.count({
        where: {
          ...whereClause,
          fechaVencimiento: { lt: new Date() },
          estado: { in: ['ABIERTO', 'EN_PROGRESO'] }
        }
      }),
      
      // Tiempo promedio de resolución
      calcularPromedioResolucion(whereClause, startDate, endDate)
    ]);

    // Estadísticas por prioridad
    const ticketsPorPrioridad = await prisma.ticket.groupBy({
      by: ['prioridad'],
      where: whereClause,
      _count: { prioridad: true }
    });

    // Tickets creados en el período
    const ticketsNuevos = await prisma.ticket.count({
      where: {
        ...whereClause,
        creadoEn: { gte: startDate, lte: endDate }
      }
    });

    // Tickets resueltos en el período
    const ticketsResueltosEnPeriodo = await prisma.ticket.count({
      where: {
        ...whereClause,
        fechaResolucion: { gte: startDate, lte: endDate }
      }
    });

    // Calcular porcentaje de resolución
    const porcentajeResolucion = totalTickets > 0 
      ? Math.round(((ticketsResueltos + ticketsCerrados) / totalTickets) * 100) 
      : 0;

    // Tendencia (comparar con período anterior)
    const tendencia = await calcularTendencia(whereClause, timeRange);

    const estadisticas = {
      resumen: {
        totalTickets,
        ticketsAbiertos,
        ticketsEnProgreso,
        ticketsResueltos,
        ticketsCerrados,
        ticketsPendientes,
        ticketsVencidos,
        ticketsNuevos,
        ticketsResueltosEnPeriodo,
        porcentajeResolucion,
        promedioResolucionHoras: promedioResolucion
      },
      porPrioridad: ticketsPorPrioridad.reduce((acc, item) => {
        acc[item.prioridad] = item._count.prioridad;
        return acc;
      }, {}),
      tendencia,
      periodo: {
        inicio: startDate,
        fin: endDate,
        rango: timeRange
      },
      ultimaActualizacion: new Date().toISOString()
    };

    res.json({
      success: true,
      data: estadisticas
    });

  } catch (error) {
    logger.error('❌ Error obteniendo estadísticas del dashboard:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener estadísticas del dashboard'
    });
  }
};

/**
 * Obtener métricas específicas
 * GET /api/dashboard/metrics
 */
const obtenerMetricas = async (req, res) => {
  try {
    const { timeRange = 'week' } = req.query;
    const { startDate, endDate } = getDateRange(timeRange);
    const whereClause = buildWhereClause(req.usuario.rol, req.usuario.departamentoId, req.usuario.id);

    const metricas = await obtenerMetricasPrincipales(whereClause, startDate, endDate);

    res.json({ 
      success: true,
      data: metricas,
      timeRange,
      periodo: { startDate, endDate }
    });

  } catch (error) {
    logger.error('❌ Error obteniendo métricas:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener métricas'
    });
  }
};

/**
 * Obtener datos para gráficos específicos
 * GET /api/dashboard/charts/:tipo
 */
const obtenerDatosGrafico = async (req, res) => {
  try {
    const { tipo } = req.params;
    const { timeRange = 'week' } = req.query;
    const { startDate, endDate } = getDateRange(timeRange);
    const whereClause = buildWhereClause(req.usuario.rol, req.usuario.departamentoId, req.usuario.id);

    let datos;

    switch (tipo) {
      case 'tickets-por-estado':
        datos = await obtenerTicketsPorEstado(whereClause);
        break;
      case 'tickets-por-prioridad':
        datos = await obtenerTicketsPorPrioridad(whereClause);
        break;
      case 'tickets-por-categoria':
        datos = await obtenerTicketsPorCategoria(whereClause);
        break;
      case 'tendencia-creacion':
        datos = await obtenerTendenciaCreacion(whereClause, startDate, endDate, timeRange);
        break;
      case 'tiempo-resolucion':
        datos = await obtenerTiempoResolucion(whereClause, startDate, endDate);
        break;
      case 'carga-trabajo':
        datos = await obtenerCargaTrabajo(whereClause, startDate, endDate);
        break;
      default:
        return res.status(400).json({
          error: 'Tipo de gráfico no válido',
          message: `El tipo '${tipo}' no está soportado`
        });
    }

    res.json({ 
      success: true,
      data: datos,
      tipo,
      timeRange,
      periodo: { startDate, endDate }
    });

  } catch (error) {
    logger.error('❌ Error obteniendo datos de gráfico:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener datos del gráfico'
    });
  }
};

/**
 * Obtener tickets recientes
 * GET /api/dashboard/recent-tickets
 */
const obtenerTicketsRecientes = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const whereClause = buildWhereClause(req.usuario.rol, req.usuario.departamentoId, req.usuario.id);

    const tickets = await prisma.ticket.findMany({
      where: whereClause,
      select: {
        id: true,
        numeroTicket: true,
        asunto: true,
        estado: true,
        prioridad: true,
        creadoEn: true,
        fechaVencimiento: true,
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
            nombreCompleto: true
          }
        },
        categoria: {
          select: {
            id: true,
            nombre: true,
            color: true
          }
        }
      },
      orderBy: { creadoEn: 'desc' },
      take: parseInt(limit)
    });

    res.json({ 
      success: true,
      data: tickets 
    });

  } catch (error) {
    logger.error('❌ Error obteniendo tickets recientes:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener tickets recientes'
    });
  }
};

/**
 * Obtener alertas del sistema
 * GET /api/dashboard/alerts
 */
const obtenerAlertas = async (req, res) => {
  try {
    const alertas = await obtenerAlertasActivas(req.usuario.rol, req.usuario.departamentoId);
    
    res.json({ 
      success: true,
      data: alertas 
    });

  } catch (error) {
    logger.error('❌ Error obteniendo alertas:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener alertas'
    });
  }
};

/**
 * Obtener rendimiento de agentes
 * GET /api/dashboard/performance
 */
const obtenerRendimientoAgentes = async (req, res) => {
  try {
    const { timeRange = 'month' } = req.query;
    const { startDate, endDate } = getDateRange(timeRange);

    let whereClause = {
      creadoEn: {
        gte: startDate,
        lte: endDate
      }
    };

    // Filtrar por departamento si es jefe de departamento
    if (req.usuario.rol === 'JEFE_DEPARTAMENTO') {
      whereClause.departamentoId = req.usuario.departamentoId;
    }

    const agentes = await prisma.usuario.findMany({
      where: {
        rol: 'AGENTE',
        estaActivo: true,
        ...(req.usuario.rol === 'JEFE_DEPARTAMENTO' && {
          departamentoId: req.usuario.departamentoId
        })
      },
      select: {
        id: true,
        nombreCompleto: true,
        email: true,
        departamento: {
          select: {
            nombre: true
          }
        },
        ticketsAsignados: {
          where: whereClause,
          select: {
            id: true,
            estado: true,
            prioridad: true,
            creadoEn: true,
            fechaResolucion: true,
            horasReales: true
          }
        },
        registrosTrabajo: {
          where: {
            fechaTrabajo: {
              gte: startDate,
              lte: endDate
            }
          },
          select: {
            horas: true
          }
        }
      }
    });

    const rendimiento = agentes.map(agente => {
      const tickets = agente.ticketsAsignados;
      const totalTickets = tickets.length;
      const ticketsResueltos = tickets.filter(t => t.estado === 'RESUELTO').length;
      const ticketsCerrados = tickets.filter(t => t.estado === 'CERRADO').length;
      const horasTrabajadas = agente.registrosTrabajo.reduce((sum, registro) => sum + (registro.horas || 0), 0);
      
      const tiemposResolucion = tickets
        .filter(t => t.fechaResolucion)
        .map(t => {
          const inicio = new Date(t.creadoEn);
          const fin = new Date(t.fechaResolucion);
          return (fin - inicio) / (1000 * 60 * 60); // Horas
        });

      const tiempoPromedioResolucion = tiemposResolucion.length > 0
        ? tiemposResolucion.reduce((sum, t) => sum + t, 0) / tiemposResolucion.length
        : 0;

      const eficiencia = totalTickets > 0 ? Math.round(((ticketsResueltos + ticketsCerrados) / totalTickets) * 100) : 0;

      return {
        agente: {
          id: agente.id,
          nombre: agente.nombreCompleto,
          email: agente.email,
          departamento: agente.departamento.nombre
        },
        metricas: {
          totalTickets,
          ticketsResueltos,
          ticketsCerrados,
          ticketsEnProgreso: tickets.filter(t => t.estado === 'EN_PROGRESO').length,
          horasTrabajadas: Math.round(horasTrabajadas * 100) / 100,
          tiempoPromedioResolucion: Math.round(tiempoPromedioResolucion * 100) / 100,
          eficiencia
        }
      };
    });

    res.json({ 
      success: true,
      data: rendimiento,
      periodo: { startDate, endDate, timeRange }
    });

  } catch (error) {
    logger.error('❌ Error obteniendo rendimiento de agentes:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener rendimiento de agentes'
    });
  }
};

/**
 * Obtener resumen completo del dashboard
 * GET /api/dashboard/summary
 */
const obtenerResumenCompleto = async (req, res) => {
  try {
    const { timeRange = 'week' } = req.query;
    const usuarioActual = req.usuario;

    // Obtener todas las métricas en paralelo
    const [estadisticas, ticketsRecientes, alertas, rendimiento] = await Promise.all([
      obtenerEstadisticasInternas(usuarioActual, timeRange),
      obtenerTicketsRecientesInterno(usuarioActual, 5),
      obtenerAlertasActivas(usuarioActual.rol, usuarioActual.departamentoId),
      usuarioActual.rol !== 'CLIENTE' ? obtenerRendimientoInterno(usuarioActual, timeRange) : null
    ]);

    const resumen = {
      estadisticas,
      ticketsRecientes,
      alertas,
      ...(rendimiento && { rendimiento }),
      usuario: {
        rol: usuarioActual.rol,
        departamento: usuarioActual.departamentoId
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: resumen
    });

  } catch (error) {
    logger.error('❌ Error obteniendo resumen completo:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener resumen del dashboard'
    });
  }
};

/**
 * Obtener actividad reciente del sistema
 * GET /api/dashboard/activity
 */
const obtenerActividadReciente = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const whereClause = buildWhereClause(req.usuario.rol, req.usuario.departamentoId, req.usuario.id);

    // Obtener actividad de múltiples fuentes
    const [ticketsRecientes, comentariosRecientes, cambiosEstado] = await Promise.all([
      // Tickets creados recientemente
      prisma.ticket.findMany({
        where: {
          ...whereClause,
          creadoEn: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Últimas 24 horas
        },
        select: {
          id: true,
          numeroTicket: true,
          asunto: true,
          estado: true,
          prioridad: true,
          creadoEn: true,
          creador: { select: { nombreCompleto: true } }
        },
        orderBy: { creadoEn: 'desc' },
        take: parseInt(limit) / 3
      }),

      // Comentarios recientes
      prisma.comentario.findMany({
        where: {
          creadoEn: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          ticket: whereClause
        },
        select: {
          id: true,
          contenido: true,
          creadoEn: true,
          autor: { select: { nombreCompleto: true } },
          ticket: { 
            select: { 
              numeroTicket: true,
              asunto: true 
            } 
          }
        },
        orderBy: { creadoEn: 'desc' },
        take: parseInt(limit) / 3
      }),

      // Cambios de estado recientes
      prisma.historialEstado.findMany({
        where: {
          cambiadoEn: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          ticket: whereClause
        },
        select: {
          id: true,
          estadoAnterior: true,
          estadoNuevo: true,
          comentario: true,
          cambiadoEn: true,
          ticket: { 
            select: { 
              numeroTicket: true,
              asunto: true 
            } 
          }
        },
        orderBy: { cambiadoEn: 'desc' },
        take: parseInt(limit) / 3
      })
    ]);

    // Combinar y formatear actividades
    const actividades = [
      ...ticketsRecientes.map(ticket => ({
        tipo: 'ticket_creado',
        titulo: `Nuevo ticket: ${ticket.numeroTicket}`,
        descripcion: ticket.asunto,
        usuario: ticket.creador.nombreCompleto,
        fecha: ticket.creadoEn,
        prioridad: ticket.prioridad,
        metadata: { ticketId: ticket.id, numeroTicket: ticket.numeroTicket }
      })),
      ...comentariosRecientes.map(comentario => ({
        tipo: 'comentario_agregado',
        titulo: `Comentario en ${comentario.ticket.numeroTicket}`,
        descripcion: comentario.contenido.substring(0, 100) + '...',
        usuario: comentario.autor.nombreCompleto,
        fecha: comentario.creadoEn,
        metadata: { 
          comentarioId: comentario.id,
          numeroTicket: comentario.ticket.numeroTicket,
          asunto: comentario.ticket.asunto
        }
      })),
      ...cambiosEstado.map(cambio => ({
        tipo: 'estado_cambiado',
        titulo: `Estado cambiado en ${cambio.ticket.numeroTicket}`,
        descripcion: `De ${cambio.estadoAnterior} a ${cambio.estadoNuevo}`,
        usuario: 'Sistema',
        fecha: cambio.cambiadoEn,
        metadata: {
          estadoAnterior: cambio.estadoAnterior,
          estadoNuevo: cambio.estadoNuevo,
          numeroTicket: cambio.ticket.numeroTicket
        }
      }))
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, parseInt(limit));

    res.json({
      success: true,
      data: actividades
    });

  } catch (error) {
    logger.error('❌ Error obteniendo actividad reciente:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener actividad reciente'
    });
  }
};

/**
 * Obtener tendencias y comparativas
 * GET /api/dashboard/trends
 */
const obtenerTendencias = async (req, res) => {
  try {
    const { metric = 'tickets', period = 'week' } = req.query;
    const whereClause = buildWhereClause(req.usuario.rol, req.usuario.departamentoId, req.usuario.id);

    let tendencias;

    switch (metric) {
      case 'tickets':
        tendencias = await calcularTendenciaTickets(whereClause, period);
        break;
      case 'resolution_time':
        tendencias = await calcularTendenciaTiempoResolucion(whereClause, period);
        break;
      case 'satisfaction':
        tendencias = await calcularTendenciaSatisfaccion(whereClause, period);
        break;
      case 'workload':
        tendencias = await calcularTendenciaCargaTrabajo(whereClause, period);
        break;
      default:
        return res.status(400).json({
          error: 'Métrica no válida',
          message: `La métrica '${metric}' no está soportada`
        });
    }

    res.json({
      success: true,
      data: tendencias,
      metric,
      period
    });

  } catch (error) {
    logger.error('❌ Error obteniendo tendencias:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener tendencias'
    });
  }
};

// ========================================
// FUNCIONES AUXILIARES
// ========================================

/**
 * Obtener rango de fechas según el parámetro timeRange
 */
function getDateRange(timeRange) {
  const now = new Date();
  let startDate, endDate = now;

  switch (timeRange) {
    case 'day':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  return { startDate, endDate };
}

/**
 * Construir cláusula WHERE según el rol del usuario
 */
function buildWhereClause(rol, departamentoId, usuarioId) {
  let where = {};

  switch (rol) {
    case 'ADMIN':
      // Sin filtros adicionales
      break;
    case 'JEFE_DEPARTAMENTO':
      where.departamentoId = departamentoId;
      break;
    case 'AGENTE':
      where.agenteId = usuarioId;
      break;
    case 'CLIENTE':
      where.creadorId = usuarioId;
      break;
  }

  return where;
}

/**
 * Calcular tiempo promedio de resolución
 */
async function calcularPromedioResolucion(whereClause, startDate, endDate) {
  const ticketsResueltos = await prisma.ticket.findMany({
    where: {
      ...whereClause,
      fechaResolucion: { not: null, gte: startDate, lte: endDate }
    },
    select: {
      creadoEn: true,
      fechaResolucion: true
    }
  });

  if (ticketsResueltos.length === 0) return 0;

  const tiempoTotal = ticketsResueltos.reduce((sum, ticket) => {
    const tiempoResolucion = (new Date(ticket.fechaResolucion) - new Date(ticket.creadoEn)) / (1000 * 60 * 60);
    return sum + tiempoResolucion;
  }, 0);

  return Math.round(tiempoTotal / ticketsResueltos.length);
}

/**
 * Calcular tendencia comparando períodos
 */
async function calcularTendencia(whereClause, timeRange) {
  const { startDate: currentStart, endDate: currentEnd } = getDateRange(timeRange);
  
  // Calcular período anterior
  const periodLength = currentEnd - currentStart;
  const previousStart = new Date(currentStart.getTime() - periodLength);
  const previousEnd = new Date(currentEnd.getTime() - periodLength);

  const [ticketsActuales, ticketsPrevios] = await Promise.all([
    prisma.ticket.count({
      where: {
        ...whereClause,
        creadoEn: { gte: currentStart, lte: currentEnd }
      }
    }),
    prisma.ticket.count({
      where: {
        ...whereClause,
        creadoEn: { gte: previousStart, lte: previousEnd }
      }
    })
  ]);

  const cambio = ticketsPrevios > 0 ? ((ticketsActuales - ticketsPrevios) / ticketsPrevios) * 100 : 0;

  return {
    actual: ticketsActuales,
    anterior: ticketsPrevios,
    cambio: Math.round(cambio * 100) / 100,
    direccion: cambio > 0 ? 'up' : cambio < 0 ? 'down' : 'stable'
  };
}

/**
 * Obtener tickets por estado
 */
async function obtenerTicketsPorEstado(whereClause) {
  const datos = await prisma.ticket.groupBy({
    by: ['estado'],
    where: whereClause,
    _count: { estado: true }
  });

  return datos.map(item => ({
    estado: item.estado,
    cantidad: item._count.estado,
    label: getEstadoLabel(item.estado),
    color: getEstadoColor(item.estado)
  }));
}

/**
 * Obtener tickets por prioridad
 */
async function obtenerTicketsPorPrioridad(whereClause) {
  const datos = await prisma.ticket.groupBy({
    by: ['prioridad'],
    where: whereClause,
    _count: { prioridad: true }
  });

  return datos.map(item => ({
    prioridad: item.prioridad,
    cantidad: item._count.prioridad,
    label: getPrioridadLabel(item.prioridad),
    color: getPrioridadColor(item.prioridad)
  }));
}

/**
 * Obtener tickets por categoría
 */
async function obtenerTicketsPorCategoria(whereClause) {
  const datos = await prisma.ticket.groupBy({
    by: ['categoriaId'],
    where: whereClause,
    _count: { categoriaId: true },
    _max: { categoria: { select: { nombre: true, color: true } } }
  });

  // Obtener nombres de categorías
  const categoriaIds = datos.map(d => d.categoriaId).filter(Boolean);
  const categorias = await prisma.categoria.findMany({
    where: { id: { in: categoriaIds } },
    select: { id: true, nombre: true, color: true }
  });

  const categoriaMap = categorias.reduce((acc, cat) => {
    acc[cat.id] = cat;
    return acc;
  }, {});

  return datos.map(item => ({
    categoriaId: item.categoriaId,
    cantidad: item._count.categoriaId,
    categoria: categoriaMap[item.categoriaId] || { nombre: 'Sin categoría', color: '#9CA3AF' }
  }));
}

/**
 * Obtener tendencia de creación de tickets
 */
async function obtenerTendenciaCreacion(whereClause, startDate, endDate, timeRange) {
  const intervalos = getIntervalos(startDate, endDate, timeRange);
  
  const datos = await Promise.all(
    intervalos.map(async (intervalo) => {
      const count = await prisma.ticket.count({
        where: {
          ...whereClause,
          creadoEn: {
            gte: intervalo.inicio,
            lte: intervalo.fin
          }
        }
      });

      return {
        fecha: intervalo.label,
        cantidad: count,
        periodo: intervalo
      };
    })
  );

  return datos;
}

/**
 * Obtener tiempo de resolución por período
 */
async function obtenerTiempoResolucion(whereClause, startDate, endDate) {
  const tickets = await prisma.ticket.findMany({
    where: {
      ...whereClause,
      fechaResolucion: { not: null, gte: startDate, lte: endDate }
    },
    select: {
      creadoEn: true,
      fechaResolucion: true,
      prioridad: true
    }
  });

  const datosPorPrioridad = tickets.reduce((acc, ticket) => {
    const tiempoHoras = (new Date(ticket.fechaResolucion) - new Date(ticket.creadoEn)) / (1000 * 60 * 60);
    
    if (!acc[ticket.prioridad]) {
      acc[ticket.prioridad] = [];
    }
    acc[ticket.prioridad].push(tiempoHoras);
    
    return acc;
  }, {});

  return Object.entries(datosPorPrioridad).map(([prioridad, tiempos]) => ({
    prioridad,
    promedio: Math.round((tiempos.reduce((sum, t) => sum + t, 0) / tiempos.length) * 100) / 100,
    minimo: Math.min(...tiempos),
    maximo: Math.max(...tiempos),
    total: tiempos.length
  }));
}

/**
 * Obtener carga de trabajo
 */
async function obtenerCargaTrabajo(whereClause, startDate, endDate) {
  const agentes = await prisma.usuario.findMany({
    where: {
      rol: 'AGENTE',
      estaActivo: true
    },
    select: {
      id: true,
      nombreCompleto: true,
      ticketsAsignados: {
        where: {
          ...whereClause,
          creadoEn: { gte: startDate, lte: endDate }
        }
      }
    }
  });

  return agentes.map(agente => ({
    agente: agente.nombreCompleto,
    ticketsAsignados: agente.ticketsAsignados.length,
    cargaTrabajo: agente.ticketsAsignados.length > 15 ? 'alta' : 
                  agente.ticketsAsignados.length > 8 ? 'media' : 'baja'
  }));
}

/**
 * Obtener alertas activas del sistema
 */
async function obtenerAlertasActivas(rol, departamentoId) {
  const alertas = [];

  let whereClause = {};
  if (rol === 'JEFE_DEPARTAMENTO') {
    whereClause.departamentoId = departamentoId;
  }

  // Tickets urgentes sin asignar
  const ticketsUrgentes = await prisma.ticket.count({
    where: {
      ...whereClause,
      prioridad: 'URGENTE',
      estado: 'ABIERTO',
      agenteId: null
    }
  });

  if (ticketsUrgentes > 0) {
    alertas.push({
      tipo: 'error',
      titulo: 'Tickets Urgentes Sin Asignar',
      mensaje: `Hay ${ticketsUrgentes} tickets urgentes esperando asignación`,
      cantidad: ticketsUrgentes,
      accion: {
        texto: 'Ver Tickets',
        url: '/tickets?prioridad=URGENTE&estado=ABIERTO'
      },
      fecha: new Date()
    });
  }

  // Tickets vencidos
  const ticketsVencidos = await prisma.ticket.count({
    where: {
      ...whereClause,
      fechaVencimiento: { lt: new Date() },
      estado: { in: ['ABIERTO', 'EN_PROGRESO'] }
    }
  });

  if (ticketsVencidos > 0) {
    alertas.push({
      tipo: 'warning',
      titulo: 'Tickets Vencidos',
      mensaje: `${ticketsVencidos} tickets han superado su fecha de vencimiento`,
      cantidad: ticketsVencidos,
      accion: {
        texto: 'Revisar',
        url: '/tickets?vencidos=true'
      },
      fecha: new Date()
    });
  }

  // Tickets sin actividad reciente (más de 48 horas)
  const hace48Horas = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const ticketsSinActividad = await prisma.ticket.count({
    where: {
      ...whereClause,
      estado: 'EN_PROGRESO',
      actualizadoEn: { lt: hace48Horas }
    }
  });

  if (ticketsSinActividad > 0) {
    alertas.push({
      tipo: 'info',
      titulo: 'Tickets Sin Actividad',
      mensaje: `${ticketsSinActividad} tickets en progreso sin actividad reciente`,
      cantidad: ticketsSinActividad,
      accion: {
        texto: 'Revisar',
        url: '/tickets?estado=EN_PROGRESO&sinActividad=true'
      },
      fecha: new Date()
    });
  }

  return alertas;
}

/**
 * Obtener intervalos para gráficos de tendencia
 */
function getIntervalos(startDate, endDate, timeRange) {
  const intervalos = [];
  const diff = endDate - startDate;
  
  let intervalo, formato;
  
  switch (timeRange) {
    case 'day':
      intervalo = 60 * 60 * 1000; // 1 hora
      formato = 'HH:mm';
      break;
    case 'week':
      intervalo = 24 * 60 * 60 * 1000; // 1 día
      formato = 'DD/MM';
      break;
    case 'month':
      intervalo = 7 * 24 * 60 * 60 * 1000; // 1 semana
      formato = 'DD/MM';
      break;
    case 'year':
      intervalo = 30 * 24 * 60 * 60 * 1000; // 1 mes
      formato = 'MMM YYYY';
      break;
    default:
      intervalo = 24 * 60 * 60 * 1000;
      formato = 'DD/MM';
  }

  let current = new Date(startDate);
  while (current < endDate) {
    const siguiente = new Date(current.getTime() + intervalo);
    
    intervalos.push({
      inicio: new Date(current),
      fin: siguiente > endDate ? endDate : siguiente,
      label: formatearFecha(current, formato)
    });
    
    current = siguiente;
  }

  return intervalos;
}

/**
 * Formatear fecha según formato especificado
 */
function formatearFecha(fecha, formato) {
  const opciones = {
    'HH:mm': { hour: '2-digit', minute: '2-digit' },
    'DD/MM': { day: '2-digit', month: '2-digit' },
    'MMM YYYY': { month: 'short', year: 'numeric' }
  };

  return fecha.toLocaleDateString('es-ES', opciones[formato] || opciones['DD/MM']);
}

/**
 * Obtener label del estado
 */
function getEstadoLabel(estado) {
  const labels = {
    'ABIERTO': 'Abierto',
    'EN_PROGRESO': 'En Progreso',
    'EN_ESPERA': 'En Espera',
    'RESUELTO': 'Resuelto',
    'CERRADO': 'Cerrado',
    'CANCELADO': 'Cancelado'
  };
  return labels[estado] || estado;
}

/**
 * Obtener color del estado
 */
function getEstadoColor(estado) {
  const colores = {
    'ABIERTO': '#EF4444',
    'EN_PROGRESO': '#F59E0B',
    'EN_ESPERA': '#8B5CF6',
    'RESUELTO': '#10B981',
    'CERRADO': '#6B7280',
    'CANCELADO': '#DC2626'
  };
  return colores[estado] || '#9CA3AF';
}

/**
 * Obtener label de prioridad
 */
function getPrioridadLabel(prioridad) {
  const labels = {
    'BAJA': 'Baja',
    'MEDIA': 'Media',
    'ALTA': 'Alta',
    'URGENTE': 'Urgente'
  };
  return labels[prioridad] || prioridad;
}

/**
 * Obtener color de prioridad
 */
function getPrioridadColor(prioridad) {
  const colores = {
    'BAJA': '#10B981',
    'MEDIA': '#F59E0B',
    'ALTA': '#EF4444',
    'URGENTE': '#DC2626'
  };
  return colores[prioridad] || '#9CA3AF';
}

/**
 * Funciones auxiliares internas para el resumen completo
 */
async function obtenerEstadisticasInternas(usuario, timeRange) {
  const { startDate, endDate } = getDateRange(timeRange);
  const whereClause = buildWhereClause(usuario.rol, usuario.departamentoId, usuario.id);
  return await obtenerMetricasPrincipales(whereClause, startDate, endDate);
}

async function obtenerTicketsRecientesInterno(usuario, limit) {
  const whereClause = buildWhereClause(usuario.rol, usuario.departamentoId, usuario.id);
  
  return await prisma.ticket.findMany({
    where: whereClause,
    select: {
      id: true,
      numeroTicket: true,
      asunto: true,
      estado: true,
      prioridad: true,
      creadoEn: true
    },
    orderBy: { creadoEn: 'desc' },
    take: limit
  });
}

async function obtenerRendimientoInterno(usuario, timeRange) {
  if (usuario.rol === 'CLIENTE') return null;
  
  // Implementación simplificada del rendimiento
  return {
    eficiencia: 85,
    ticketsCompletados: 12,
    tiempoPromedio: 4.5
  };
}

async function obtenerMetricasPrincipales(whereClause, startDate, endDate) {
  const [
    totalTickets,
    ticketsAbiertos,
    ticketsEnProgreso,
    ticketsResueltos,
    ticketsCerrados
  ] = await Promise.all([
    prisma.ticket.count({ where: whereClause }),
    prisma.ticket.count({ where: { ...whereClause, estado: 'ABIERTO' } }),
    prisma.ticket.count({ where: { ...whereClause, estado: 'EN_PROGRESO' } }),
    prisma.ticket.count({ where: { ...whereClause, estado: 'RESUELTO' } }),
    prisma.ticket.count({ where: { ...whereClause, estado: 'CERRADO' } })
  ]);

  const avgResolutionTime = await calcularPromedioResolucion(whereClause, startDate, endDate);
  const satisfaction = Math.round(85 + Math.random() * 10); // Simulado

  return {
    totalTickets,
    openTickets: ticketsAbiertos,
    inProgressTickets: ticketsEnProgreso,
    resolvedTickets: ticketsResueltos,
    closedTickets: ticketsCerrados,
    avgResolutionTime,
    satisfaction
  };
}

// Funciones de tendencias específicas
async function calcularTendenciaTickets(whereClause, period) {
  // Implementación básica - expandir según necesidades
  return {
    actual: 45,
    anterior: 38,
    cambio: 18.4,
    direccion: 'up'
  };
}

async function calcularTendenciaTiempoResolucion(whereClause, period) {
  return {
    actual: 4.2,
    anterior: 5.1,
    cambio: -17.6,
    direccion: 'down'
  };
}

async function calcularTendenciaSatisfaccion(whereClause, period) {
  return {
    actual: 87,
    anterior: 84,
    cambio: 3.6,
    direccion: 'up'
  };
}

async function calcularTendenciaCargaTrabajo(whereClause, period) {
  return {
    actual: 12.5,
    anterior: 10.8,
    cambio: 15.7,
    direccion: 'up'
  };
}

module.exports = {
  obtenerEstadisticas,
  obtenerMetricas,
  obtenerDatosGrafico,
  obtenerTicketsRecientes,
  obtenerAlertas,
  obtenerRendimientoAgentes,
  obtenerResumenCompleto,
  obtenerActividadReciente,
  obtenerTendencias
};