/**
 * Rutas de gestión de comentarios
 * CRUD de comentarios de tickets
 */

const express = require('express');
const comentarioController = require('../controllers/comentarioController');
const { authenticate, authorize } = require('../middleware/auth');
const { commentValidation, validateUuidParam } = require('../middleware/validation');
const { operationLogger } = require('../middleware/logger');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * GET /api/comentarios/:id
 * Obtener comentario específico
 */
router.get('/:id', 
  validateUuidParam('id'),
  operationLogger('obtener_comentario'),
  comentarioController.obtenerComentarioPorId
);

/**
 * PUT /api/comentarios/:id
 * Editar comentario
 */
router.put('/:id',
  commentValidation.update,
  operationLogger('editar_comentario'),
  comentarioController.editarComentario
);

/**
 * DELETE /api/comentarios/:id
 * Eliminar comentario
 */
router.delete('/:id',
  validateUuidParam('id'),
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('eliminar_comentario'),
  comentarioController.eliminarComentario
);

module.exports = router;