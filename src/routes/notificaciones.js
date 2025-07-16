/**
 * Rutas de gestión de notificaciones
 * Sistema de notificaciones del usuario
 */

const express = require('express');
const notificacionController = require('../controllers/notificacionController');
const { authenticate } = require('../middleware/auth');
const { validateUuidParam, paginationValidation } = require('../middleware/validation');
const { operationLogger } = require('../middleware/logger');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * GET /api/notificaciones
 * Obtener notificaciones del usuario
 */
router.get('/', 
  paginationValidation,
  operationLogger('listar_notificaciones'),
  notificacionController.obtenerNotificaciones
);

/**
 * GET /api/notificaciones/no-leidas
 * Obtener cantidad de notificaciones no leídas
 */
router.get('/no-leidas', 
  operationLogger('contar_no_leidas'),
  notificacionController.contarNoLeidas
);

/**
 * PATCH /api/notificaciones/:id/leer
 * Marcar notificación como leída
 */
router.patch('/:id/leer',
  validateUuidParam('id'),
  operationLogger('marcar_leida'),
  notificacionController.marcarComoLeida
);

/**
 * PATCH /api/notificaciones/leer-todas
 * Marcar todas las notificaciones como leídas
 */
router.patch('/leer-todas',
  operationLogger('marcar_todas_leidas'),
  notificacionController.marcarTodasComoLeidas
);

/**
 * DELETE /api/notificaciones/:id
 * Eliminar notificación
 */
router.delete('/:id',
  validateUuidParam('id'),
  operationLogger('eliminar_notificacion'),
  notificacionController.eliminarNotificacion
);

module.exports = router;