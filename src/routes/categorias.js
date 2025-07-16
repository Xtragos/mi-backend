/**
 * Rutas de gestión de categorías
 * CRUD completo con validaciones y autorización
 */

const express = require('express');
const categoriaController = require('../controllers/categoriaController');
const { authenticate, authorize } = require('../middleware/auth');
const { categoryValidation, validateUuidParam, paginationValidation } = require('../middleware/validation');
const { operationLogger } = require('../middleware/logger');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * GET /api/categorias
 * Obtener lista de categorías
 */
router.get('/', 
  paginationValidation,
  operationLogger('listar_categorias'),
  categoriaController.obtenerCategorias
);

/**
 * POST /api/categorias
 * Crear nueva categoría
 */
router.post('/', 
  categoryValidation.create,
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('crear_categoria'),
  categoriaController.crearCategoria
);

/**
 * GET /api/categorias/:id
 * Obtener categoría específica
 */
router.get('/:id', 
  validateUuidParam('id'),
  operationLogger('obtener_categoria'),
  categoriaController.obtenerCategoriaPorId
);

/**
 * PUT /api/categorias/:id
 * Actualizar categoría
 */
router.put('/:id',
  categoryValidation.create,
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('actualizar_categoria'),
  categoriaController.actualizarCategoria
);

/**
 * DELETE /api/categorias/:id
 * Desactivar categoría
 */
router.delete('/:id',
  validateUuidParam('id'),
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('desactivar_categoria'),
  categoriaController.desactivarCategoria
);

module.exports = router;