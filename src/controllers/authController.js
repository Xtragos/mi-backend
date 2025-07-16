/**
 * Controlador de autenticación
 * Maneja login, logout, registro y gestión de tokens
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Iniciar sesión
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    // Validar errores de entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Buscar usuario por email
    const usuario = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        departamento: {
          select: {
            id: true,
            nombre: true,
            color: true
          }
        }
      }
    });

    if (!usuario) {
      logger.warn(`🚫 Intento de login fallido: usuario no encontrado (${email})`);
      return res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email o contraseña incorrectos'
      });
    }

    if (!usuario.estaActivo) {
      logger.warn(`🚫 Intento de login de usuario inactivo: ${email}`);
      return res.status(403).json({
        error: 'Usuario inactivo',
        message: 'Su cuenta ha sido desactivada. Contacte al administrador.'
      });
    }

    // Verificar contraseña
    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) {
      logger.warn(`🚫 Intento de login fallido: contraseña incorrecta (${email})`);
      return res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email o contraseña incorrectos'
      });
    }

    // Generar tokens JWT
    const tokenPayload = {
      userId: usuario.id,
      email: usuario.email,
      rol: usuario.rol
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h'
    });

    const refreshToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    });

    // Crear sesión activa
    const sesion = await prisma.sesionActiva.create({
      data: {
        usuarioId: usuario.id,
        token: accessToken,
        direccionIP: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('User-Agent') || 'Unknown',
        esMovil: /Mobile|Android|iPhone|iPad/.test(req.get('User-Agent')),
        expiraEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 días
      }
    });

    // Actualizar último login
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLogin: new Date() }
    });

    // Preparar respuesta (sin password)
    const { password: _, ...usuarioSinPassword } = usuario;

    logger.info(`✅ Login exitoso: ${email} (${usuario.rol})`);

    res.json({
      message: 'Login exitoso',
      accessToken,
      refreshToken,
      usuario: usuarioSinPassword,
      sesion: {
        id: sesion.id,
        expiraEn: sesion.expiraEn
      }
    });

  } catch (error) {
    logger.error('❌ Error en login:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al procesar inicio de sesión'
    });
  }
};

/**
 * Cerrar sesión
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    const { token, usuario } = req;

    // Eliminar sesión activa
    await prisma.sesionActiva.deleteMany({
      where: {
        usuarioId: usuario.id,
        token: token
      }
    });

    logger.info(`🔓 Logout exitoso: ${usuario.email}`);

    res.json({
      message: 'Logout exitoso'
    });

  } catch (error) {
    logger.error('❌ Error en logout:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al cerrar sesión'
    });
  }
};

/**
 * Renovar token
 * POST /api/auth/refresh
 */
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Token requerido',
        message: 'Debe proporcionar un refresh token'
      });
    }

    // Verificar refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    // Buscar usuario
    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.userId }
    });

    if (!usuario || !usuario.estaActivo) {
      return res.status(401).json({
        error: 'Token inválido',
        message: 'El refresh token no es válido'
      });
    }

    // Generar nuevo access token
    const tokenPayload = {
      userId: usuario.id,
      email: usuario.email,
      rol: usuario.rol
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h'
    });

    // Actualizar sesión activa
    await prisma.sesionActiva.updateMany({
      where: {
        usuarioId: usuario.id
      },
      data: {
        token: accessToken,
        expiraEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      accessToken
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token inválido',
        message: 'El refresh token ha expirado o es inválido'
      });
    }

    logger.error('❌ Error renovando token:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al renovar token'
    });
  }
};

/**
 * Obtener perfil del usuario actual
 * GET /api/auth/profile
 
const getProfile = async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: {
        id: true,
        email: true,
        nombreCompleto: true,
        telefono: true,
        rol: true,
        avatar: true,
        configuracion: true,
        ultimoLogin: true,
        creadoEn: true,
        departamento: {
          select: {
            id: true,
            nombre: true,
            color: true
          }
        }
      }
    });

    if (!usuario) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El usuario no existe o ha sido eliminado'
      });
    }

    res.json({
      usuario
    });

  } catch (error) {
    logger.error('❌ Error obteniendo perfil:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener perfil'
    });
  }
};
*/

/**
 * Cambiar contraseña
 * POST /api/auth/change-password
 */
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.usuario.id;

    // Obtener usuario actual
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId }
    });

    if (!usuario) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    // Verificar contraseña actual
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, usuario.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        error: 'Contraseña incorrecta',
        message: 'La contraseña actual no es correcta'
      });
    }

    // Hash de la nueva contraseña
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Actualizar contraseña
    await prisma.usuario.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });

    // Invalidar todas las sesiones activas (forzar re-login)
    await prisma.sesionActiva.deleteMany({
      where: { usuarioId: userId }
    });

    logger.info(`✅ Contraseña cambiada para usuario: ${usuario.email}`);

    res.json({
      message: 'Contraseña cambiada exitosamente. Por favor, inicie sesión nuevamente.'
    });

  } catch (error) {
    logger.error('❌ Error cambiando contraseña:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al cambiar contraseña'
    });
  }
};

/**
 * Verificar token
 * GET /api/auth/verify
 */
const verifyToken = async (req, res) => {
  try {
    // Si llegamos aquí, el token es válido (middleware de auth lo verificó)
    res.json({
      valid: true,
      usuario: {
        id: req.usuario.id,
        email: req.usuario.email,
        rol: req.usuario.rol
      }
    });
  } catch (error) {
    logger.error('❌ Error verificando token:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al verificar token'
    });
  }
};

/**
 * Obtener sesiones activas del usuario
 * GET /api/auth/sessions
 */
const getSessions = async (req, res) => {
  try {
    const sesiones = await prisma.sesionActiva.findMany({
      where: {
        usuarioId: req.usuario.id,
        expiraEn: {
          gt: new Date()
        }
      },
      select: {
        id: true,
        direccionIP: true,
        userAgent: true,
        esMovil: true,
        creadoEn: true,
        expiraEn: true
      },
      orderBy: {
        creadoEn: 'desc'
      }
    });

    res.json({
      sesiones
    });

  } catch (error) {
    logger.error('❌ Error obteniendo sesiones:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener sesiones'
    });
  }
};

/**
 * Cerrar sesión específica
 * DELETE /api/auth/sessions/:sessionId
 */
const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    await prisma.sesionActiva.deleteMany({
      where: {
        id: sessionId,
        usuarioId: req.usuario.id
      }
    });

    res.json({
      message: 'Sesión cerrada exitosamente'
    });

  } catch (error) {
    logger.error('❌ Error cerrando sesión:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al cerrar sesión'
    });
  }
};

/**
 * Cerrar todas las sesiones excepto la actual
 * POST /api/auth/revoke-all-sessions
 */
const revokeAllSessions = async (req, res) => {
  try {
    const currentToken = req.token;

    await prisma.sesionActiva.deleteMany({
      where: {
        usuarioId: req.usuario.id,
        token: {
          not: currentToken
        }
      }
    });

    res.json({
      message: 'Todas las demás sesiones han sido cerradas'
    });

  } catch (error) {
    logger.error('❌ Error cerrando sesiones:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al cerrar sesiones'
    });
  }
};

/**
 * Obtener perfil del usuario autenticado
 * GET /api/auth/profile
 */
const getProfile = async (req, res) => {
  try {
    // El usuario ya está disponible desde el middleware authenticate
    const userId = req.usuario.id;

    // Obtener datos completos del usuario
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nombreCompleto: true,
        telefono: true,
        rol: true,
        avatar: true,
        configuracion: true,
        estaActivo: true,
        ultimoLogin: true,
        creadoEn: true,
        actualizadoEn: true,
        departamento: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            color: true
          }
        },
        // Estadísticas básicas del usuario
        _count: {
          select: {
            ticketsCreados: true,
            ticketsAsignados: true,
            comentarios: true
          }
        }
      }
    });

    if (!usuario) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El usuario autenticado no existe en la base de datos'
      });
    }

    if (!usuario.estaActivo) {
      return res.status(403).json({
        error: 'Cuenta desactivada',
        message: 'Su cuenta ha sido desactivada'
      });
    }

    // Obtener estadísticas adicionales según el rol
    let estadisticas = {};
    
    if (usuario.rol === 'CLIENTE') {
      // Estadísticas para clientes
      const [ticketsAbiertos, ticketsResueltos, ultimosTickets] = await Promise.all([
        prisma.ticket.count({
          where: {
            creadorId: userId,
            estado: { in: ['ABIERTO', 'EN_PROGRESO', 'EN_ESPERA'] }
          }
        }),
        prisma.ticket.count({
          where: {
            creadorId: userId,
            estado: { in: ['RESUELTO', 'CERRADO'] }
          }
        }),
        prisma.ticket.findMany({
          where: { creadorId: userId },
          select: {
            id: true,
            numeroTicket: true,
            asunto: true,
            estado: true,
            prioridad: true,
            creadoEn: true
          },
          orderBy: { creadoEn: 'desc' },
          take: 5
        })
      ]);

      estadisticas = {
        ticketsAbiertos,
        ticketsResueltos,
        ultimosTickets
      };

    } else if (usuario.rol === 'AGENTE') {
      // Estadísticas para agentes
      const [ticketsAsignados, ticketsEnProgreso, horasTrabajadas] = await Promise.all([
        prisma.ticket.count({
          where: { agenteId: userId }
        }),
        prisma.ticket.count({
          where: {
            agenteId: userId,
            estado: 'EN_PROGRESO'
          }
        }),
        prisma.registroTrabajo.aggregate({
          where: { agenteId: userId },
          _sum: { horas: true }
        })
      ]);

      estadisticas = {
        ticketsAsignados,
        ticketsEnProgreso,
        horasTrabajadas: horasTrabajadas._sum.horas || 0
      };

    } else if (usuario.rol === 'JEFE_DEPARTAMENTO') {
      // Estadísticas para jefes de departamento
      const [ticketsDepartamento, ticketsSinAsignar, agentesActivos] = await Promise.all([
        prisma.ticket.count({
          where: { departamentoId: usuario.departamento?.id }
        }),
        prisma.ticket.count({
          where: {
            departamentoId: usuario.departamento?.id,
            agenteId: null,
            estado: 'ABIERTO'
          }
        }),
        prisma.usuario.count({
          where: {
            departamentoId: usuario.departamento?.id,
            rol: 'AGENTE',
            estaActivo: true
          }
        })
      ]);

      estadisticas = {
        ticketsDepartamento,
        ticketsSinAsignar,
        agentesActivos
      };

    } else if (usuario.rol === 'ADMIN') {
      // Estadísticas para administradores
      const [totalTickets, totalUsuarios, departamentosActivos] = await Promise.all([
        prisma.ticket.count(),
        prisma.usuario.count({ where: { estaActivo: true } }),
        prisma.departamento.count({ where: { estaActivo: true } })
      ]);

      estadisticas = {
        totalTickets,
        totalUsuarios,
        departamentosActivos
      };
    }

    // Obtener notificaciones no leídas
    const notificacionesNoLeidas = await prisma.notificacion.count({
      where: {
        usuarioId: userId,
        esLeida: false
      }
    });

    // Actualizar último acceso
    await prisma.usuario.update({
      where: { id: userId },
      data: { ultimoLogin: new Date() }
    });

    // Preparar respuesta
    const perfil = {
      usuario: {
        ...usuario,
        estadisticas,
        notificacionesNoLeidas
      },
      permisos: getPermissionsByRole(usuario.rol),
      configuracion: usuario.configuracion || getDefaultConfig(),
      sesion: {
        inicioSesion: req.usuario.iat ? new Date(req.usuario.iat * 1000) : new Date(),
        expiraEn: req.usuario.exp ? new Date(req.usuario.exp * 1000) : null,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    };

    logger.info(`✅ Perfil obtenido para usuario: ${usuario.email}`);

    res.json({
      message: 'Perfil obtenido exitosamente',
      ...perfil
    });

  } catch (error) {
    logger.error('❌ Error obteniendo perfil:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener perfil del usuario'
    });
  }
};

/**
 * Obtener permisos según el rol
 * @private
 */
const getPermissionsByRole = (rol) => {
  const permisos = {
    ADMIN: [
      'usuarios.crear',
      'usuarios.editar',
      'usuarios.eliminar',
      'usuarios.ver_todos',
      'tickets.ver_todos',
      'tickets.asignar',
      'tickets.editar_todos',
      'departamentos.gestionar',
      'categorias.gestionar',
      'reportes.generar',
      'sistema.configurar'
    ],
    JEFE_DEPARTAMENTO: [
      'usuarios.ver_departamento',
      'tickets.ver_departamento',
      'tickets.asignar_departamento',
      'tickets.editar_departamento',
      'agentes.gestionar',
      'reportes.departamento'
    ],
    AGENTE: [
      'tickets.ver_asignados',
      'tickets.editar_asignados',
      'tickets.comentar',
      'trabajo.registrar',
      'perfil.editar'
    ],
    CLIENTE: [
      'tickets.crear',
      'tickets.ver_propios',
      'tickets.comentar_propios',
      'perfil.editar'
    ]
  };

  return permisos[rol] || [];
};

/**
 * Obtener configuración por defecto
 * @private
 */
const getDefaultConfig = () => {
  return {
    tema: 'light',
    idioma: 'es',
    notificaciones: {
      email: true,
      navegador: true,
      urgentes: true
    },
    dashboard: {
      widgetsVisibles: ['tickets', 'estadisticas', 'actividad'],
      autoRefresh: true,
      intervaloRefresh: 30000
    },
    preferencias: {
      ticketsPorPagina: 20,
      ordenDefecto: 'fecha_desc',
      mostrarAvatares: true
    }
  };
};


module.exports = {
  login,
  logout,
  refresh,
  getProfile,
  changePassword,
  verifyToken,
  getSessions,
  revokeSession,
  revokeAllSessions
};