/**
 * Rutas de gestión de usuarios
 * CRUD completo con validaciones y autorización
 */

const express = require('express');
const { body, param } = require('express-validator');
const usuarioController = require('../controllers/usuarioController');
const { authenticate, authorize } = require('../middleware/auth');
const { userValidation, validateUuidParam, paginationValidation, handleValidationErrors } = require('../middleware/validation');
const { operationLogger } = require('../middleware/logger');
const { avatar } = require('../middleware/upload');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * GET /api/usuarios
 * Obtener lista de usuarios con filtros
 */
router.get('/', 
  paginationValidation,
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('listar_usuarios'),
  usuarioController.obtenerUsuarios
);

/**
 * POST /api/usuarios
 * Crear nuevo usuario (solo admin)
 */
router.post('/', 
  userValidation.create,
  authorize(['ADMIN']),
  operationLogger('crear_usuario'),
  usuarioController.crearUsuario
);

/**
 * GET /api/usuarios/perfil
 * Obtener perfil del usuario actual
 */
router.get('/perfil',
  operationLogger('obtener_perfil_propio'),
  usuarioController.obtenerPerfilPropio
);

/**
 * PUT /api/usuarios/perfil
 * Actualizar perfil del usuario actual
 */
router.put('/perfil',
  [
    body('nombreCompleto')
      .optional()
      .isLength({ min: 3, max: 100 })
      .withMessage('Nombre completo debe tener entre 3 y 100 caracteres')
      .trim(),
    body('telefono')
      .optional()
      .matches(/^[\+]?[1-9][\d]{0,15}$/)
      .withMessage('Teléfono debe tener formato válido'),
    body('configuracion')
      .optional()
      .isObject()
      .withMessage('Configuración debe ser un objeto válido'),
    handleValidationErrors
  ],
  operationLogger('actualizar_perfil_propio'),
  usuarioController.actualizarPerfilPropio
);

/**
 * POST /api/usuarios/perfil/avatar
 * Subir avatar del usuario actual
 */
router.post('/perfil/avatar',
  ...avatar, // Spread del array de middleware
  operationLogger('subir_avatar_propio'),
  usuarioController.subirAvatarPropio
);

/**
 * POST /api/usuarios/perfil/cambiar-password
 * Cambiar contraseña propia
 */
router.post('/perfil/cambiar-password',
  [
    body('passwordActual')
      .notEmpty()
      .withMessage('Contraseña actual requerida'),
    body('nuevaPassword')
      .isLength({ min: 8 })
      .withMessage('Contraseña debe tener al menos 8 caracteres')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Contraseña debe contener al menos: 1 minúscula, 1 mayúscula, 1 número y 1 símbolo'),
    handleValidationErrors
  ],
  operationLogger('cambiar_password_propio'),
  usuarioController.cambiarPasswordPropio
);

/**
 * GET /api/usuarios/departamento/:departamentoId
 * Obtener usuarios por departamento
 */
router.get('/departamento/:departamentoId',
  validateUuidParam('departamentoId'),
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('usuarios_por_departamento'),
  usuarioController.obtenerUsuariosPorDepartamento
);

/**
 * GET /api/usuarios/rol/:rol
 * Obtener usuarios por rol
 */
router.get('/rol/:rol',
  [
    param('rol')
      .isIn(['ADMIN', 'JEFE_DEPARTAMENTO', 'AGENTE', 'CLIENTE'])
      .withMessage('Rol inválido'),
    handleValidationErrors
  ],
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('usuarios_por_rol'),
  usuarioController.obtenerUsuariosPorRol
);

/**
 * GET /api/usuarios/:id
 * Obtener usuario específico
 */
router.get('/:id', 
  validateUuidParam('id'),
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('obtener_usuario'),
  usuarioController.obtenerUsuarioPorId
);

/**
 * PUT /api/usuarios/:id
 * Actualizar usuario (solo admin)
 */
router.put('/:id',
  userValidation.update,
  authorize(['ADMIN']),
  operationLogger('actualizar_usuario'),
  usuarioController.actualizarUsuario
);

/**
 * DELETE /api/usuarios/:id
 * Desactivar usuario (soft delete)
 */
router.delete('/:id',
  validateUuidParam('id'),
  authorize(['ADMIN']),
  operationLogger('desactivar_usuario'),
  usuarioController.desactivarUsuario
);

/**
 * POST /api/usuarios/:id/activar
 * Activar usuario desactivado
 */
router.post('/:id/activar',
  validateUuidParam('id'),
  authorize(['ADMIN']),
  operationLogger('activar_usuario'),
  usuarioController.activarUsuario
);

/**
 * POST /api/usuarios/:id/avatar
 * Subir avatar del usuario (solo admin)
 */
router.post('/:id/avatar',
  validateUuidParam('id'),
  authorize(['ADMIN']), // Solo admin puede cambiar avatar de otros usuarios
  ...avatar, // Spread del array de middleware
  operationLogger('subir_avatar'),
  usuarioController.subirAvatar
);

/**
 * DELETE /api/usuarios/:id/avatar
 * Eliminar avatar del usuario
 */
router.delete('/:id/avatar',
  validateUuidParam('id'),
  authorize(['ADMIN']),
  operationLogger('eliminar_avatar'),
  usuarioController.eliminarAvatar
);

/**
 * POST /api/usuarios/:id/cambiar-password
 * Cambiar contraseña de usuario (solo admin)
 */
router.post('/:id/cambiar-password',
  [
    param('id')
      .isUUID()
      .withMessage('ID de usuario inválido'),
    body('nuevaPassword')
      .isLength({ min: 8 })
      .withMessage('Contraseña debe tener al menos 8 caracteres')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Contraseña debe contener al menos: 1 minúscula, 1 mayúscula, 1 número y 1 símbolo'),
    handleValidationErrors
  ],
  authorize(['ADMIN']),
  operationLogger('cambiar_password_usuario'),
  usuarioController.cambiarPassword
);

/**
 * GET /api/usuarios/:id/estadisticas
 * Obtener estadísticas del usuario (tickets, etc.)
 */
router.get('/:id/estadisticas',
  validateUuidParam('id'),
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('estadisticas_usuario'),
  usuarioController.obtenerEstadisticasUsuario
);

module.exports = router;