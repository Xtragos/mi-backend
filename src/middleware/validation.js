/**
 * Middleware de validación centralizado
 * Proporciona validaciones reutilizables para diferentes entidades
 */

const { body, query, param, validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

/**
 * Middleware para manejar errores de validación
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('🚫 Errores de validación:', {
      url: req.originalUrl,
      method: req.method,
      errors: errors.array(),
      userId: req.usuario?.id || null
    });

    return res.status(400).json({
      error: 'Datos inválidos',
      message: 'Los datos enviados no cumplen con los requisitos',
      details: errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  
  next();
};

/**
 * Validaciones para autenticación
 */
const authValidation = {
  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Email válido requerido'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Contraseña debe tener al menos 6 caracteres'),
    handleValidationErrors
  ],

  refresh: [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token requerido'),
    handleValidationErrors
  ]
};

/**
 * Validaciones para tickets
 */
const ticketValidation = {
  create: [
    body('asunto')
      .isLength({ min: 5, max: 200 })
      .withMessage('Asunto debe tener entre 5 y 200 caracteres')
      .trim(),
    body('descripcion')
      .isLength({ min: 10, max: 2000 })
      .withMessage('Descripción debe tener entre 10 y 2000 caracteres')
      .trim(),
    body('departamentoId')
      .isUUID()
      .withMessage('ID de departamento válido requerido'),
    body('categoriaId')
      .isUUID()
      .withMessage('ID de categoría válido requerido'),
    body('prioridad')
      .optional()
      .isIn(['BAJA', 'MEDIA', 'ALTA', 'URGENTE'])
      .withMessage('Prioridad debe ser: BAJA, MEDIA, ALTA o URGENTE'),
    body('proyectoId')
      .optional()
      .isUUID()
      .withMessage('ID de proyecto debe ser válido'),
    body('ubicacion')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Ubicación no puede exceder 500 caracteres')
      .trim(),
    body('coordenadas')
      .optional()
      .matches(/^-?\d+\.?\d*,-?\d+\.?\d*$/)
      .withMessage('Coordenadas deben tener formato lat,lng (ej: -8.9824,-79.5199)'),
    body('fechaVencimiento')
      .optional()
      .isISO8601()
      .withMessage('Fecha de vencimiento debe ser válida')
      .custom((value) => {
        if (new Date(value) <= new Date()) {
          throw new Error('Fecha de vencimiento debe ser futura');
        }
        return true;
      }),
    body('horasEstimadas')
      .optional()
      .isFloat({ min: 0.1, max: 999 })
      .withMessage('Horas estimadas debe ser un número entre 0.1 y 999'),
    handleValidationErrors
  ],

  update: [
    param('id')
      .isUUID()
      .withMessage('ID de ticket inválido'),
    body('asunto')
      .optional()
      .isLength({ min: 5, max: 200 })
      .withMessage('Asunto debe tener entre 5 y 200 caracteres')
      .trim(),
    body('descripcion')
      .optional()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Descripción debe tener entre 10 y 2000 caracteres')
      .trim(),
    handleValidationErrors
  ],

  assign: [
    param('id')
      .isUUID()
      .withMessage('ID de ticket inválido'),
    body('agenteId')
      .isUUID()
      .withMessage('ID de agente válido requerido'),
    handleValidationErrors
  ],

  updateStatus: [
    param('id')
      .isUUID()
      .withMessage('ID de ticket inválido'),
    body('estado')
      .isIn(['ABIERTO', 'EN_PROGRESO', 'EN_ESPERA', 'RESUELTO', 'CERRADO', 'CANCELADO'])
      .withMessage('Estado inválido'),
    body('comentario')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Comentario no puede exceder 500 caracteres')
      .trim(),
    handleValidationErrors
  ],

  addWorkLog: [
    param('id')
      .isUUID()
      .withMessage('ID de ticket inválido'),
    body('descripcion')
      .isLength({ min: 10, max: 1000 })
      .withMessage('Descripción debe tener entre 10 y 1000 caracteres')
      .trim(),
    body('horas')
      .isFloat({ min: 0.1, max: 24 })
      .withMessage('Horas debe ser un número entre 0.1 y 24'),
    body('fechaTrabajo')
      .optional()
      .isISO8601()
      .withMessage('Fecha de trabajo debe ser válida')
      .custom((value) => {
        const workDate = new Date(value);
        const now = new Date();
        const maxPastDays = 30;
        const minDate = new Date(now.getTime() - (maxPastDays * 24 * 60 * 60 * 1000));
        
        if (workDate > now) {
          throw new Error('Fecha de trabajo no puede ser futura');
        }
        if (workDate < minDate) {
          throw new Error(`Fecha de trabajo no puede ser mayor a ${maxPastDays} días en el pasado`);
        }
        return true;
      }),
    handleValidationErrors
  ],

  addSignature: [
    param('id')
      .isUUID()
      .withMessage('ID de ticket inválido'),
    body('datosBase64')
      .matches(/^data:image\/[a-zA-Z]+;base64,/)
      .withMessage('Datos de firma en formato base64 requeridos')
      .isLength({ min: 100, max: 500000 })
      .withMessage('Firma debe tener un tamaño válido'),
    body('firmanteId')
      .optional()
      .isUUID()
      .withMessage('ID de firmante debe ser válido'),
    handleValidationErrors
  ]
};

/**
 * Validaciones para usuarios
 */
const userValidation = {
  create: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Email válido requerido'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Contraseña debe tener al menos 8 caracteres')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Contraseña debe contener al menos: 1 minúscula, 1 mayúscula, 1 número y 1 símbolo'),
    body('nombreCompleto')
      .isLength({ min: 3, max: 100 })
      .withMessage('Nombre completo debe tener entre 3 y 100 caracteres')
      .trim(),
    body('telefono')
      .optional()
      .matches(/^[\+]?[1-9][\d]{0,15}$/)
      .withMessage('Teléfono debe tener formato válido'),
    body('rol')
      .isIn(['ADMIN', 'JEFE_DEPARTAMENTO', 'AGENTE', 'CLIENTE'])
      .withMessage('Rol inválido'),
    body('departamentoId')
      .if(body('rol').isIn(['JEFE_DEPARTAMENTO', 'AGENTE']))
      .isUUID()
      .withMessage('Departamento requerido para jefes y agentes'),
    handleValidationErrors
  ],

  update: [
    param('id')
      .isUUID()
      .withMessage('ID de usuario inválido'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Email válido requerido'),
    body('nombreCompleto')
      .optional()
      .isLength({ min: 3, max: 100 })
      .withMessage('Nombre completo debe tener entre 3 y 100 caracteres')
      .trim(),
    body('telefono')
      .optional()
      .matches(/^[\+]?[1-9][\d]{0,15}$/)
      .withMessage('Teléfono debe tener formato válido'),
    handleValidationErrors
  ]
};


/**
 * Validaciones para comentarios
 */
const commentValidation = {
  create: [
    param('id')
      .isUUID()
      .withMessage('ID de ticket inválido'),
    body('contenido')
      .isLength({ min: 1, max: 2000 })
      .withMessage('Contenido debe tener entre 1 y 2000 caracteres')
      .trim(),
    body('esInterno')
      .optional()
      .isBoolean()
      .withMessage('esInterno debe ser booleano'),
    handleValidationErrors
  ],

  update: [
    param('id')
      .isUUID()
      .withMessage('ID de comentario inválido'),
    body('contenido')
      .isLength({ min: 1, max: 2000 })
      .withMessage('Contenido debe tener entre 1 y 2000 caracteres')
      .trim(),
    handleValidationErrors
  ]
};

/**
 * Validaciones para departamentos
 */
const departmentValidation = {
  create: [
    body('nombre')
      .isLength({ min: 3, max: 100 })
      .withMessage('Nombre debe tener entre 3 y 100 caracteres')
      .trim(),
    body('descripcion')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Descripción no puede exceder 500 caracteres')
      .trim(),
    body('color')
      .optional()
      .matches(/^#[0-9A-F]{6}$/i)
      .withMessage('Color debe ser un código hexadecimal válido'),
    handleValidationErrors
  ]
};

/**
 * Validaciones para categorías
 */
const categoryValidation = {
  create: [
    body('nombre')
      .isLength({ min: 3, max: 100 })
      .withMessage('Nombre debe tener entre 3 y 100 caracteres')
      .trim(),
    body('descripcion')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Descripción no puede exceder 500 caracteres')
      .trim(),
    body('departamentoId')
      .isUUID()
      .withMessage('ID de departamento válido requerido'),
    body('color')
      .optional()
      .matches(/^#[0-9A-F]{6}$/i)
      .withMessage('Color debe ser un código hexadecimal válido'),
    body('icono')
      .optional()
      .isLength({ max: 50 })
      .withMessage('Icono no puede exceder 50 caracteres'),
    handleValidationErrors
  ]
};

/**
 * Validaciones para queries de paginación
 */
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Página debe ser un número entero mayor a 0'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Límite debe ser un número entre 1 y 100'),
  handleValidationErrors
];

/**
 * Validaciones para filtros de tickets
 */
const ticketFiltersValidation = [
  query('estado')
    .optional()
    .isIn(['ABIERTO', 'EN_PROGRESO', 'EN_ESPERA', 'RESUELTO', 'CERRADO', 'CANCELADO'])
    .withMessage('Estado de filtro inválido'),
  query('prioridad')
    .optional()
    .isIn(['BAJA', 'MEDIA', 'ALTA', 'URGENTE'])
    .withMessage('Prioridad de filtro inválida'),
  query('departamentoId')
    .optional()
    .isUUID()
    .withMessage('ID de departamento debe ser válido'),
  query('categoriaId')
    .optional()
    .isUUID()
    .withMessage('ID de categoría debe ser válido'),
  query('agenteId')
    .optional()
    .isUUID()
    .withMessage('ID de agente debe ser válido'),
  query('buscar')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Búsqueda debe tener entre 1 y 100 caracteres')
    .trim(),
  ...paginationValidation
];

/**
 * Validación para IDs de parámetros UUID
 */
const validateUuidParam = (paramName = 'id') => [
  param(paramName)
    .isUUID()
    .withMessage(`${paramName} debe ser un UUID válido`),
  handleValidationErrors
];


/**
 * Sanitizar inputs para prevenir XSS
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Escapar caracteres peligrosos básicos
        obj[key] = obj[key]
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;')
          .replace(/\//g, '&#x2F;');
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };

  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);

  next();
};

module.exports = {
  handleValidationErrors,
  authValidation,
  ticketValidation,
  userValidation,
  commentValidation,
  departmentValidation,
  categoryValidation,
  paginationValidation,
  ticketFiltersValidation,
  validateUuidParam,
  sanitizeInput
};