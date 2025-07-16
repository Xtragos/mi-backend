/**
 * Rutas del dashboard
 * Proporciona endpoints para métricas y estadísticas
 */

const express = require('express');
const { query } = require('express-validator');
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { operationLogger } = require('../middleware/logger');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * GET /api/dashboard/stats
 * Obtener estadísticas principales del dashboard
 */
router.get('/stats',
  [
    query('timeRange')
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage('Rango de tiempo inválido'),
    query('userId')
      .optional()
      .isUUID()
      .withMessage('ID de usuario inválido'),
    query('userRole')
      .optional()
      .isIn(['ADMIN', 'JEFE_DEPARTAMENTO', 'AGENTE', 'CLIENTE'])
      .withMessage('Rol de usuario inválido'),
    handleValidationErrors
  ],
  operationLogger('obtener_stats_dashboard'),
  dashboardController.obtenerEstadisticas
);

/**
 * GET /api/dashboard/metrics
 * Obtener métricas específicas
 */
router.get('/metrics',
  [
    query('timeRange')
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage('Rango de tiempo inválido'),
    handleValidationErrors
  ],
  operationLogger('obtener_metricas'),
  dashboardController.obtenerMetricas
);

/**
 * GET /api/dashboard/charts/:tipo
 * Obtener datos para gráficos específicos
 */
router.get('/charts/:tipo',
  [
    query('timeRange')
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage('Rango de tiempo inválido'),
    handleValidationErrors
  ],
  operationLogger('obtener_datos_grafico'),
  dashboardController.obtenerDatosGrafico
);

/**
 * GET /api/dashboard/recent-tickets
 * Obtener tickets recientes
 */
router.get('/recent-tickets',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Límite debe ser entre 1 y 50'),
    handleValidationErrors
  ],
  operationLogger('obtener_tickets_recientes'),
  dashboardController.obtenerTicketsRecientes
);

/**
 * GET /api/dashboard/alerts
 * Obtener alertas del sistema
 */
router.get('/alerts',
  operationLogger('obtener_alertas'),
  dashboardController.obtenerAlertas
);

/**
 * GET /api/dashboard/performance
 * Obtener rendimiento de agentes (solo admin y jefes)
 */
router.get('/performance',
  [
    query('timeRange')
      .optional()
      .isIn(['week', 'month', 'quarter', 'year'])
      .withMessage('Rango de tiempo inválido'),
    handleValidationErrors
  ],
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('obtener_rendimiento_agentes'),
  dashboardController.obtenerRendimientoAgentes
);

/**
 * GET /api/dashboard/summary
 * Obtener resumen completo del dashboard
 */
router.get('/summary',
  [
    query('timeRange')
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage('Rango de tiempo inválido'),
    handleValidationErrors
  ],
  operationLogger('obtener_resumen_dashboard'),
  dashboardController.obtenerResumenCompleto
);

/**
 * GET /api/dashboard/activity
 * Obtener actividad reciente del sistema
 */
router.get('/activity',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Límite debe ser entre 1 y 100'),
    handleValidationErrors
  ],
  operationLogger('obtener_actividad_reciente'),
  dashboardController.obtenerActividadReciente
);

/**
 * GET /api/dashboard/trends
 * Obtener tendencias y comparativas
 */
router.get('/trends',
  [
    query('metric')
      .optional()
      .isIn(['tickets', 'resolution_time', 'satisfaction', 'workload'])
      .withMessage('Métrica inválida'),
    query('period')
      .optional()
      .isIn(['week', 'month', 'quarter'])
      .withMessage('Período inválido'),
    handleValidationErrors
  ],
  authorize(['ADMIN', 'JEFE_DEPARTAMENTO']),
  operationLogger('obtener_tendencias'),
  dashboardController.obtenerTendencias
);

module.exports = router;