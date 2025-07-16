/**
 * Rutas de gestión de adjuntos
 * Manejo de archivos y descargas
 */

const express = require('express');
const adjuntoController = require('../controllers/adjuntoController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateUuidParam } = require('../middleware/validation');
const { operationLogger, uploadLogger } = require('../middleware/logger');
const upload = require('../middleware/upload');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * GET /api/adjuntos/:id
 * Descargar archivo adjunto
 */
router.get('/:id', 
  validateUuidParam('id'),
  operationLogger('descargar_adjunto'),
  adjuntoController.descargarAdjunto
);

/**
 * GET /api/adjuntos/:id/info
 * Obtener información del adjunto
 */
router.get('/:id/info', 
  validateUuidParam('id'),
  operationLogger('info_adjunto'),
  adjuntoController.obtenerInfoAdjunto
);

/**
 * DELETE /api/adjuntos/:id
 * Eliminar adjunto
 */
router.delete('/:id',
  validateUuidParam('id'),
  operationLogger('eliminar_adjunto'),
  adjuntoController.eliminarAdjunto
);

module.exports = router;