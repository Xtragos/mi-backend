/**
 * Rutas de gestión de tickets
 * CRUD completo con validaciones y autorización
 */

const express = require('express');
const { body, param } = require('express-validator');
const ticketController = require('../controllers/ticketController');
const comentarioController = require('../controllers/comentarioController');
const adjuntoController = require('../controllers/adjuntoController');
const { authenticate, authorize, verifyOwnership } = require('../middleware/auth');
const { 
  ticketValidation, 
  commentValidation, 
  validateUuidParam, 
  ticketFiltersValidation,
  handleValidationErrors
} = require('../middleware/validation');
const { operationLogger, uploadLogger } = require('../middleware/logger');
const { single: uploadSingle } = require('../middleware/upload');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * GET /api/tickets
 * Obtener lista de tickets con filtros
 */
router.get('/', 
  ticketFiltersValidation,
  operationLogger('listar_tickets'),
  ticketController.obtenerTickets
);

/**
 * POST /api/tickets
 * Crear nuevo ticket
 */
router.post('/', 
  ticketValidation.create,
  operationLogger('crear_ticket'),
  ticketController.crearTicket
);

/**
 * GET /api/tickets/stats/general
 * Obtener estadísticas generales de tickets
 */
router.get('/stats/general',
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('obtener_estadisticas'),
  ticketController.obtenerEstadisticas
);

/**
 * GET /api/tickets/export/csv
 * Exportar tickets a CSV
 */
router.get('/export/csv',
  ticketFiltersValidation,
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('exportar_tickets'),
  ticketController.exportarCSV
);

/**
 * POST /api/tickets/bulk/assign
 * Asignar múltiples tickets en lote
 */
router.post('/bulk/assign',
  [
    body('ticketIds')
      .isArray({ min: 1 })
      .withMessage('Debe proporcionar al menos un ID de ticket'),
    body('ticketIds.*')
      .isUUID()
      .withMessage('Todos los IDs deben ser UUID válidos'),
    body('agenteId')
      .isUUID()
      .withMessage('ID de agente válido requerido'),
    handleValidationErrors
  ],
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('asignacion_masiva'),
  ticketController.asignacionMasiva
);

/**
 * POST /api/tickets/bulk/status
 * Cambiar estado de múltiples tickets en lote
 */
router.post('/bulk/status',
  [
    body('ticketIds')
      .isArray({ min: 1 })
      .withMessage('Debe proporcionar al menos un ID de ticket'),
    body('ticketIds.*')
      .isUUID()
      .withMessage('Todos los IDs deben ser UUID válidos'),
    body('estado')
      .isIn(['ABIERTO', 'EN_PROGRESO', 'EN_ESPERA', 'RESUELTO', 'CERRADO', 'CANCELADO'])
      .withMessage('Estado inválido'),
    handleValidationErrors
  ],
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('cambio_estado_masivo'),
  ticketController.cambioEstadoMasivo
);

/**
 * GET /api/tickets/:id
 * Obtener ticket específico
 */
router.get('/:id', 
  validateUuidParam('id'),
  verifyOwnership('ticket'),
  operationLogger('obtener_ticket'),
  ticketController.obtenerTicketPorId
);

/**
 * PUT /api/tickets/:id
 * Actualizar ticket completo (solo creador o admin)
 */
router.put('/:id',
  ticketValidation.update,
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  verifyOwnership('ticket'),
  operationLogger('actualizar_ticket'),
  ticketController.actualizarTicket
);

/**
 * DELETE /api/tickets/:id
 * Eliminar ticket (solo admin)
 */
router.delete('/:id',
  validateUuidParam('id'),
  authorize(['ADMIN']),
  operationLogger('eliminar_ticket'),
  ticketController.eliminarTicket
);

/**
 * PATCH /api/tickets/:id/asignar
 * Asignar ticket a agente (solo jefes y admins)
 */
router.patch('/:id/asignar', 
  ticketValidation.assign,
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('asignar_ticket'),
  ticketController.asignarTicket
);

/**
 * PATCH /api/tickets/:id/estado
 * Cambiar estado del ticket
 */
router.patch('/:id/estado', 
  ticketValidation.updateStatus,
  verifyOwnership('ticket'),
  operationLogger('cambiar_estado_ticket'),
  ticketController.cambiarEstado
);

/**
 * POST /api/tickets/:id/trabajo
 * Agregar registro de trabajo (solo agentes)
 */
router.post('/:id/trabajo', 
  ticketValidation.addWorkLog,
  authorize(['AGENTE', 'JEFE_DEPARTAMENTO']),
  verifyOwnership('ticket'),
  operationLogger('agregar_trabajo'),
  ticketController.agregarRegistroTrabajo
);

/**
 * POST /api/tickets/:id/firma
 * Guardar firma digital
 */
router.post('/:id/firma', 
  ticketValidation.addSignature,
  verifyOwnership('ticket'),
  operationLogger('guardar_firma'),
  ticketController.guardarFirma
);

/**
 * POST /api/tickets/:id/comentarios
 * Agregar comentario al ticket
 */
router.post('/:id/comentarios', 
  commentValidation.create,
  verifyOwnership('ticket'),
  operationLogger('agregar_comentario'),
  comentarioController.crearComentario
);

/**
 * PUT /api/tickets/:id/comentarios/:comentarioId
 * Editar comentario (solo autor o admin)
 */
router.put('/:id/comentarios/:comentarioId',
  validateUuidParam('id'),
  validateUuidParam('comentarioId'),
  commentValidation.update,
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('editar_comentario'),
  comentarioController.editarComentario
);

/**
 * DELETE /api/tickets/:id/comentarios/:comentarioId
 * Eliminar comentario (solo autor o admin)
 */
router.delete('/:id/comentarios/:comentarioId',
  validateUuidParam('id'),
  validateUuidParam('comentarioId'),
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('eliminar_comentario'),
  comentarioController.eliminarComentario
);

/**
 * POST /api/tickets/:id/adjuntos
 * Subir archivo adjunto
 */
router.post('/:id/adjuntos', 
  validateUuidParam('id'),
  verifyOwnership('ticket'),
  ...uploadSingle,
  uploadLogger,
  operationLogger('subir_adjunto'),
  adjuntoController.subirAdjunto
);

/**
 * DELETE /api/tickets/:id/adjuntos/:adjuntoId
 * Eliminar archivo adjunto
 */
router.delete('/:id/adjuntos/:adjuntoId',
  validateUuidParam('id'),
  validateUuidParam('adjuntoId'),
  verifyOwnership('ticket'),
  operationLogger('eliminar_adjunto'),
  adjuntoController.eliminarAdjunto
);

/**
 * GET /api/tickets/:id/historial
 * Obtener historial de estados del ticket
 */
router.get('/:id/historial',
  validateUuidParam('id'),
  verifyOwnership('ticket'),
  operationLogger('obtener_historial'),
  ticketController.obtenerHistorial
);

/**
 * GET /api/tickets/:id/pdf
 * Generar y descargar PDF del ticket
 */
router.get('/:id/pdf',
  validateUuidParam('id'),
  verifyOwnership('ticket'),
  operationLogger('generar_pdf'),
  ticketController.generarPDF
);

/**
 * POST /api/tickets/:id/reabrir
 * Reabrir ticket cerrado (solo admin o jefe)
 */
router.post('/:id/reabrir',
  validateUuidParam('id'),
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  verifyOwnership('ticket'),
  operationLogger('reabrir_ticket'),
  ticketController.reabrirTicket
);

module.exports = router;