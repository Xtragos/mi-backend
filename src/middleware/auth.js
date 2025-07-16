/**
 * Middleware de autenticación y autorización
 * Maneja tokens JWT y roles de usuario
 */

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Middleware de autenticación
 * Verifica token JWT y carga datos del usuario
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Token requerido',
        message: 'Debe proporcionar un token de autenticación válido'
      });
    }

    const token = authHeader.substring(7);

    // Verificar token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuario en base de datos
    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.userId },
      include: {
        departamento: true
      }
    });

    if (!usuario) {
      return res.status(401).json({
        error: 'Usuario no encontrado',
        message: 'El token corresponde a un usuario inexistente'
      });
    }

    if (!usuario.estaActivo) {
      return res.status(403).json({
        error: 'Usuario inactivo',
        message: 'Su cuenta ha sido desactivada'
      });
    }

    // Verificar sesión activa (opcional - mayor seguridad)
    const sesionActiva = await prisma.sesionActiva.findFirst({
      where: {
        usuarioId: usuario.id,
        token: token,
        expiraEn: {
          gt: new Date()
        }
      }
    });

    if (!sesionActiva) {
      return res.status(401).json({
        error: 'Sesión expirada',
        message: 'Debe iniciar sesión nuevamente'
      });
    }

    // Adjuntar usuario a request
    req.usuario = usuario;
    req.token = token;
    
    logger.info(`🔐 Usuario autenticado: ${usuario.email} (${usuario.rol})`);
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token inválido',
        message: 'El token proporcionado no es válido'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        message: 'Su sesión ha expirado, inicie sesión nuevamente'
      });
    }

    logger.error('❌ Error en autenticación:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al verificar autenticación'
    });
  }
};

/**
 * Middleware de autorización por roles
 * @param {Array} rolesPermitidos - Array de roles que pueden acceder
 */
const authorize = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        error: 'No autenticado',
        message: 'Debe autenticarse primero'
      });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      logger.warn(`🚫 Acceso denegado para ${req.usuario.email} (${req.usuario.rol}) a ruta ${req.originalUrl}`);
      
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tiene permisos para realizar esta acción'
      });
    }

    next();
  };
};

/**
 * Middleware para verificar propiedad de recursos
 * Permite que usuarios accedan solo a sus propios recursos
 */
const verifyOwnership = (resourceType) => {
  return async (req, res, next) => {
    try {
      const { id } = req.params;
      const usuario = req.usuario;

      let resource;
      
      switch (resourceType) {
        case 'ticket':
          resource = await prisma.ticket.findUnique({
            where: { id },
            include: { creador: true, agente: true, departamento: true }
          });
          
          // Admins y jefes de departamento pueden ver todos
          if (usuario.rol === 'ADMIN') {
            break;
          }
          
          if (usuario.rol === 'JEFE_DEPARTAMENTO') {
            if (resource.departamentoId !== usuario.departamentoId) {
              return res.status(403).json({
                error: 'Acceso denegado',
                message: 'No puede acceder a tickets de otros departamentos'
              });
            }
            break;
          }
          
          // Agentes solo pueden ver sus tickets asignados
          if (usuario.rol === 'AGENTE') {
            if (resource.agenteId !== usuario.id) {
              return res.status(403).json({
                error: 'Acceso denegado',
                message: 'Solo puede ver tickets asignados a usted'
              });
            }
            break;
          }
          
          // Clientes solo pueden ver sus propios tickets
          if (usuario.rol === 'CLIENTE') {
            if (resource.creadorId !== usuario.id) {
              return res.status(403).json({
                error: 'Acceso denegado',
                message: 'Solo puede ver sus propios tickets'
              });
            }
          }
          break;
          
        default:
          return res.status(400).json({
            error: 'Tipo de recurso no válido'
          });
      }

      if (!resource) {
        return res.status(404).json({
          error: 'Recurso no encontrado'
        });
      }

      req.resource = resource;
      next();

    } catch (error) {
      logger.error('❌ Error verificando propiedad:', error);
      res.status(500).json({
        error: 'Error interno',
        message: 'Error al verificar permisos'
      });
    }
  };
};

module.exports = {
  authenticate,
  authorize,
  verifyOwnership
};