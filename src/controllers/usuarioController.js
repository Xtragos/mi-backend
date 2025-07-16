/**
 * Controlador de usuarios
 * Maneja CRUD de usuarios del sistema
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const path = require('path');
const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { sanitizeFilename } = require('../utils/helpers');
const { deleteFile } = require('../middleware/upload');

const { body, param } = require('express-validator');

const prisma = new PrismaClient();

/**
 * Obtener lista de usuarios
 */
const obtenerUsuarios = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      rol,
      departamentoId,
      estaActivo = true,
      buscar
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    // Aplicar filtros
    if (rol) where.rol = rol;
    if (departamentoId) where.departamentoId = departamentoId;
    if (estaActivo !== undefined) where.estaActivo = estaActivo === 'true';

    // Búsqueda por texto
    if (buscar) {
      where.OR = [
        { nombreCompleto: { contains: buscar, mode: 'insensitive' } },
        { email: { contains: buscar, mode: 'insensitive' } }
      ];
    }

    // Filtro por departamento si es jefe de departamento
    if (req.usuario.rol === 'JEFE_DEPARTAMENTO') {
      where.departamentoId = req.usuario.departamentoId;
    }

    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        select: {
          id: true,
          email: true,
          nombreCompleto: true,
          telefono: true,
          rol: true,
          estaActivo: true,
          ultimoLogin: true,
          creadoEn: true,
          departamento: {
            select: {
              id: true,
              nombre: true,
              color: true
            }
          }
        },
        orderBy: { creadoEn: 'desc' },
        skip: offset,
        take: parseInt(limit)
      }),
      prisma.usuario.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      usuarios,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    logger.error('❌ Error obteniendo usuarios:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener usuarios'
    });
  }
};

/**
 * Crear nuevo usuario
 */
const crearUsuario = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const { email, password, nombreCompleto, telefono, rol, departamentoId } = req.body;

    // Verificar si el email ya existe
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (usuarioExistente) {
      return res.status(409).json({
        error: 'Email ya existe',
        message: 'Ya existe un usuario con este email'
      });
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    // Crear usuario
    const usuario = await prisma.usuario.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        nombreCompleto,
        telefono,
        rol,
        departamentoId: rol === 'CLIENTE' ? null : departamentoId
      },
      select: {
        id: true,
        email: true,
        nombreCompleto: true,
        telefono: true,
        rol: true,
        estaActivo: true,
        creadoEn: true,
        departamento: {
          select: {
            id: true,
            nombre: true
          }
        }
      }
    });

    logger.info(`✅ Usuario creado: ${email} (${rol})`);

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      usuario
    });

  } catch (error) {
    logger.error('❌ Error creando usuario:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al crear usuario'
    });
  }
};

/**
 * Obtener usuario por ID
 */
const obtenerUsuarioPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        nombreCompleto: true,
        telefono: true,
        rol: true,
        estaActivo: true,
        ultimoLogin: true,
        avatar: true,
        configuracion: true,
        creadoEn: true,
        actualizadoEn: true,
        departamento: {
          select: {
            id: true,
            nombre: true,
            color: true
          }
        },
        _count: {
          select: {
            ticketsCreados: true,
            ticketsAsignados: true
          }
        }
      }
    });

    if (!usuario) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    res.json({ usuario });

  } catch (error) {
    logger.error('❌ Error obteniendo usuario:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener usuario'
    });
  }
};

/**
 * Actualizar usuario
 */
const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // No permitir actualizar la contraseña por esta ruta
    delete updateData.password;

    // Hash nueva contraseña si se proporciona
    if (updateData.nuevaPassword) {
      updateData.password = await bcrypt.hash(updateData.nuevaPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);
      delete updateData.nuevaPassword;
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        nombreCompleto: true,
        telefono: true,
        rol: true,
        estaActivo: true,
        actualizadoEn: true,
        departamento: {
          select: {
            id: true,
            nombre: true
          }
        }
      }
    });

    logger.info(`✅ Usuario actualizado: ${usuario.email}`);

    res.json({
      message: 'Usuario actualizado exitosamente',
      usuario
    });

  } catch (error) {
    logger.error('❌ Error actualizando usuario:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al actualizar usuario'
    });
  }
};

/**
 * Desactivar usuario (soft delete)
 */
const desactivarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { estaActivo: false },
      select: {
        id: true,
        email: true,
        nombreCompleto: true,
        estaActivo: true
      }
    });

    logger.info(`✅ Usuario desactivado: ${usuario.email}`);

    res.json({
      message: 'Usuario desactivado exitosamente',
      usuario
    });

  } catch (error) {
    logger.error('❌ Error desactivando usuario:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al desactivar usuario'
    });
  }
};

/**
 * Subir avatar del usuario
 */
const subirAvatar = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        error: 'Archivo requerido',
        message: 'Debe proporcionar un archivo de imagen'
      });
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { avatar: avatarPath },
      select: {
        id: true,
        nombreCompleto: true,
        avatar: true
      }
    });

    logger.info(`✅ Avatar actualizado para usuario: ${id}`);

    res.json({
      message: 'Avatar subido exitosamente',
      avatar: avatarPath,
      usuario
    });

  } catch (error) {
    logger.error('❌ Error subiendo avatar:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al subir avatar'
    });
  }
};

/**
 * Obtener usuarios por departamento
 */
const obtenerUsuariosPorDepartamento = async (req, res) => {
  try {
    const { departamentoId } = req.params;

    const usuarios = await prisma.usuario.findMany({
      where: {
        departamentoId,
        estaActivo: true
      },
      select: {
        id: true,
        nombreCompleto: true,
        email: true,
        rol: true,
        ultimoLogin: true
      },
      orderBy: { nombreCompleto: 'asc' }
    });

    res.json({ usuarios });

  } catch (error) {
    logger.error('❌ Error obteniendo usuarios por departamento:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener usuarios'
    });
  }
};

/**
 * Obtener perfil del usuario actual
 */
const obtenerPerfilPropio = async (req, res) => {
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
        error: 'Usuario no encontrado'
      });
    }

    res.json({ usuario });

  } catch (error) {
    logger.error('❌ Error obteniendo perfil propio:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener perfil'
    });
  }
};

/**
 * Actualizar perfil del usuario actual
 */
const actualizarPerfilPropio = async (req, res) => {
  try {
    const { nombreCompleto, telefono, configuracion } = req.body;

    const usuario = await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: {
        nombreCompleto,
        telefono,
        configuracion
      },
      select: {
        id: true,
        email: true,
        nombreCompleto: true,
        telefono: true,
        rol: true,
        avatar: true,
        configuracion: true,
        actualizadoEn: true
      }
    });

    logger.info(`✅ Perfil actualizado: ${usuario.email}`);

    res.json({
      message: 'Perfil actualizado exitosamente',
      usuario
    });

  } catch (error) {
    logger.error('❌ Error actualizando perfil propio:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al actualizar perfil'
    });
  }
};

/**
 * Subir avatar del usuario actual
 */
const subirAvatarPropio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Archivo requerido',
        message: 'Debe proporcionar un archivo de imagen'
      });
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    const usuario = await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { avatar: avatarPath },
      select: {
        id: true,
        nombreCompleto: true,
        avatar: true
      }
    });

    logger.info(`✅ Avatar propio actualizado: ${req.usuario.email}`);

    res.json({
      message: 'Avatar actualizado exitosamente',
      avatar: avatarPath,
      usuario
    });

  } catch (error) {
    logger.error('❌ Error subiendo avatar propio:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al subir avatar'
    });
  }
};

/**
 * Eliminar avatar del usuario
 */
const eliminarAvatar = async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: { avatar: true, nombreCompleto: true }
    });

    if (!usuario) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    // Eliminar archivo del disco si existe
    if (usuario.avatar) {
      const filename = path.basename(usuario.avatar);
      try {
        await deleteFile(filename, 'avatar');
      } catch (fileError) {
        logger.warn('⚠️ No se pudo eliminar archivo de avatar del disco');
      }
    }

    await prisma.usuario.update({
      where: { id },
      data: { avatar: null }
    });

    logger.info(`✅ Avatar eliminado de usuario: ${usuario.nombreCompleto}`);

    res.json({
      message: 'Avatar eliminado exitosamente'
    });

  } catch (error) {
    logger.error('❌ Error eliminando avatar:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al eliminar avatar'
    });
  }
};

/**
 * Cambiar contraseña de usuario (admin)
 */
const cambiarPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { nuevaPassword } = req.body;

    const hashedPassword = await bcrypt.hash(nuevaPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { password: hashedPassword },
      select: {
        id: true,
        email: true,
        nombreCompleto: true
      }
    });

    logger.info(`✅ Contraseña cambiada para usuario: ${usuario.email} por admin ${req.usuario.email}`);

    res.json({
      message: 'Contraseña cambiada exitosamente'
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
 * Cambiar contraseña propia
 */
const cambiarPasswordPropio = async (req, res) => {
  try {
    const { passwordActual, nuevaPassword } = req.body;

    // Verificar contraseña actual
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: { password: true, email: true }
    });

    const passwordValido = await bcrypt.compare(passwordActual, usuario.password);
    if (!passwordValido) {
      return res.status(400).json({
        error: 'Contraseña incorrecta',
        message: 'La contraseña actual no es correcta'
      });
    }

    const hashedPassword = await bcrypt.hash(nuevaPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { password: hashedPassword }
    });

    logger.info(`✅ Contraseña propia cambiada: ${usuario.email}`);

    res.json({
      message: 'Contraseña cambiada exitosamente'
    });

  } catch (error) {
    logger.error('❌ Error cambiando contraseña propia:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al cambiar contraseña'
    });
  }
};

/**
 * Obtener usuarios por rol
 */
const obtenerUsuariosPorRol = async (req, res) => {
  try {
    const { rol } = req.params;

    let whereClause = { rol, estaActivo: true };

    // Filtrar por departamento si es jefe de departamento
    if (req.usuario.rol === 'JEFE_DEPARTAMENTO') {
      whereClause.departamentoId = req.usuario.departamentoId;
    }

    const usuarios = await prisma.usuario.findMany({
      where: whereClause,
      select: {
        id: true,
        nombreCompleto: true,
        email: true,
        telefono: true,
        ultimoLogin: true,
        creadoEn: true,
        departamento: {
          select: {
            id: true,
            nombre: true
          }
        }
      },
      orderBy: { nombreCompleto: 'asc' }
    });

    res.json({ usuarios });

  } catch (error) {
    logger.error('❌ Error obteniendo usuarios por rol:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener usuarios'
    });
  }
};

/**
 * Activar usuario desactivado
 */
const activarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { estaActivo: true },
      select: {
        id: true,
        email: true,
        nombreCompleto: true,
        estaActivo: true
      }
    });

    logger.info(`✅ Usuario activado: ${usuario.email}`);

    res.json({
      message: 'Usuario activado exitosamente',
      usuario
    });

  } catch (error) {
    logger.error('❌ Error activando usuario:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al activar usuario'
    });
  }
};

/**
 * Obtener estadísticas del usuario
 */
const obtenerEstadisticasUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombreCompleto: true,
        email: true,
        rol: true
      }
    });

    if (!usuario) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    let estadisticas = {};

    if (usuario.rol === 'CLIENTE') {
      // Estadísticas para clientes
      const [ticketsCreados, ticketsAbiertos, ticketsResueltos] = await Promise.all([
        prisma.ticket.count({ where: { creadorId: id } }),
        prisma.ticket.count({ where: { creadorId: id, estado: 'ABIERTO' } }),
        prisma.ticket.count({ where: { creadorId: id, estado: { in: ['RESUELTO', 'CERRADO'] } } })
      ]);

      estadisticas = {
        ticketsCreados,
        ticketsAbiertos,
        ticketsResueltos,
        tiempoPromedioResolucion: 0 // Calcular si es necesario
      };

    } else if (usuario.rol === 'AGENTE') {
      // Estadísticas para agentes
      const [ticketsAsignados, ticketsEnProgreso, ticketsResueltos, horasTrabajadas] = await Promise.all([
        prisma.ticket.count({ where: { agenteId: id } }),
        prisma.ticket.count({ where: { agenteId: id, estado: 'EN_PROGRESO' } }),
       prisma.ticket.count({ where: { agenteId: id, estado: { in: ['RESUELTO', 'CERRADO'] } } }),
       prisma.registroTrabajo.aggregate({
         where: { agenteId: id },
         _sum: { horas: true }
       })
     ]);

     estadisticas = {
       ticketsAsignados,
       ticketsEnProgreso,
       ticketsResueltos,
       horasTrabajadas: horasTrabajadas._sum.horas || 0,
       eficiencia: ticketsAsignados > 0 ? Math.round((ticketsResueltos / ticketsAsignados) * 100) : 0
     };
   }

   res.json({
     usuario,
     estadisticas
   });

 } catch (error) {
   logger.error('❌ Error obteniendo estadísticas de usuario:', error);
   res.status(500).json({
     error: 'Error interno',
     message: 'Error al obtener estadísticas'
   });
 }
};



module.exports = {
  obtenerUsuarios,
  crearUsuario,
  obtenerUsuarioPorId,
  actualizarUsuario,
  desactivarUsuario,
  subirAvatar,
  obtenerUsuariosPorDepartamento,
 obtenerPerfilPropio,
 actualizarPerfilPropio,
 subirAvatarPropio,
 eliminarAvatar,
 cambiarPassword,
 cambiarPasswordPropio,
 obtenerUsuariosPorRol,
 activarUsuario,
 obtenerEstadisticasUsuario
};