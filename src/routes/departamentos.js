/**
 * Rutas de gestión de departamentos
 * CRUD completo con validaciones y autorización
 */

const express = require('express');
const departamentoController = require('../controllers/departamentoController');
const { authenticate, authorize } = require('../middleware/auth');
const { departmentValidation, validateUuidParam, paginationValidation } = require('../middleware/validation');
const { operationLogger } = require('../middleware/logger');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * GET /api/departamentos
 * Obtener lista de departamentos
 */
router.get('/', 
  paginationValidation,
  operationLogger('listar_departamentos'),
  departamentoController.obtenerDepartamentos
);

/**
 * POST /api/departamentos
 * Crear nuevo departamento (solo admin)
 */
router.post('/', 
  departmentValidation.create,
  authorize(['ADMIN']),
  operationLogger('crear_departamento'),
  departamentoController.crearDepartamento
);

/**
 * GET /api/departamentos/:id
 * Obtener departamento específico
 */
router.get('/:id', 
  validateUuidParam('id'),
  operationLogger('obtener_departamento'),
  departamentoController.obtenerDepartamentoPorId
);

/**
 * PUT /api/departamentos/:id
 * Actualizar departamento
 */
router.put('/:id',
  departmentValidation.create, // Usa las mismas validaciones
  authorize(['ADMIN']),
  operationLogger('actualizar_departamento'),
  departamentoController.actualizarDepartamento
);

/**
 * DELETE /api/departamentos/:id
 * Desactivar departamento
 */
router.delete('/:id',
  validateUuidParam('id'),
  authorize(['ADMIN']),
  operationLogger('desactivar_departamento'),
  departamentoController.desactivarDepartamento
);

/**
 * GET /api/departamentos/:id/usuarios
 * Obtener usuarios del departamento
 */
router.get('/:id/usuarios',
  validateUuidParam('id'),
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('usuarios_departamento'),
  departamentoController.obtenerUsuarios
);

/**
 * GET /api/departamentos/:id/categorias
 * Obtener categorías del departamento
 */
router.get('/:id/categorias',
  validateUuidParam('id'),
  operationLogger('categorias_departamento'),
  departamentoController.obtenerCategorias
);

module.exports = router;