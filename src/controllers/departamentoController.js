/**
 * Controlador de departamentos
 * Maneja CRUD de departamentos del sistema
 */

const { PrismaClient } = require('@prisma/client');
const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Obtener lista de departamentos
 */
const obtenerDepartamentos = async (req, res) => {
  try {
    // 🔍 LOG: Datos de entrada
    logger.info('🏢 === OBTENIENDO DEPARTAMENTOS ===');
    logger.info(`📋 Query params recibidos:`, {
      queryParams: req.query,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin')
    });

    // Extraer parámetros con valores por defecto
    const {
      page = 1,
      limit = 20,
      buscar
    } = req.query;

    // 🔍 LOG: Parámetros procesados
    logger.info(`⚙️ Parámetros procesados:`, {
      page: parseInt(page),
      limit: parseInt(limit),
      buscar: buscar || 'ninguno'
    });

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // ✅ SIMPLIFICADO: Solo departamentos activos
    const where = {
      estaActivo: true  // Siempre solo departamentos activos
    };

    // Agregar búsqueda si existe
    if (buscar && buscar.trim()) {
      where.OR = [
        { nombre: { contains: buscar.trim(), mode: 'insensitive' } },
        { descripcion: { contains: buscar.trim(), mode: 'insensitive' } }
      ];
    }

    // 🔍 LOG: Filtros aplicados
    logger.info(`🔍 Filtros aplicados:`, {
      where: JSON.stringify(where, null, 2),
      offset,
      take: parseInt(limit)
    });

    // Ejecutar consulta
    logger.info('📊 Ejecutando consulta a base de datos...');
    
    const [departamentos, total] = await Promise.all([
      prisma.departamento.findMany({
        where,
        include: {
          _count: {
            select: {
              usuarios: true,
              tickets: true,
              categorias: true
            }
          }
        },
        orderBy: { nombre: 'asc' },
        skip: offset,
        take: parseInt(limit)
      }),
      prisma.departamento.count({ where })
    ]);

    // 🔍 LOG: Resultados obtenidos
    logger.info(`✅ Consulta completada:`, {
      departamentosEncontrados: departamentos.length,
      totalEnBD: total,
      departamentos: departamentos.map(d => ({
        id: d.id,
        nombre: d.nombre,
        estaActivo: d.estaActivo,
        usuarios: d._count.usuarios,
        tickets: d._count.tickets,
        categorias: d._count.categorias
      }))
    });

    // Si no hay departamentos, log específico
    if (departamentos.length === 0) {
      logger.warn('⚠️ NO SE ENCONTRARON DEPARTAMENTOS ACTIVOS');
      
      // Verificar si existen departamentos inactivos
      const departamentosInactivos = await prisma.departamento.count({
        where: { estaActivo: false }
      });
      
      const totalDepartamentos = await prisma.departamento.count();
      
      logger.warn(`📊 Estadísticas de departamentos:`, {
        totalDepartamentos,
        departamentosActivos: total,
        departamentosInactivos,
        mensaje: 'Considera crear departamentos o activar existentes'
      });
    }

    const totalPages = Math.ceil(total / parseInt(limit));

    const response = {
      departamentos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    };

    // 🔍 LOG: Respuesta final
    logger.info(`📤 Enviando respuesta:`, {
      cantidadDepartamentos: departamentos.length,
      paginacion: response.pagination
    });

    res.json(response);

  } catch (error) {
    // 🔍 LOG: Error detallado
    logger.error('❌ ERROR OBTENIENDO DEPARTAMENTOS:', {
      error: error.message,
      stack: error.stack,
      queryParams: req.query,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener departamentos',
      timestamp: new Date().toISOString()
    });
  }
};
/**
 * Crear nuevo departamento
 */
const crearDepartamento = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const { nombre, descripcion, color } = req.body;

    const departamento = await prisma.departamento.create({
      data: {
        nombre,
        descripcion,
        color: color || '#3B82F6'
      },
      include: {
        _count: {
          select: {
            usuarios: true,
            tickets: true,
            categorias: true
          }
        }
      }
    });

    logger.info(`✅ Departamento creado: ${nombre}`);

    res.status(201).json({
      message: 'Departamento creado exitosamente',
      departamento
    });

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Nombre duplicado',
        message: 'Ya existe un departamento con este nombre'
      });
    }

    logger.error('❌ Error creando departamento:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al crear departamento'
    });
  }
};

/**
 * Obtener departamento por ID
 */
const obtenerDepartamentoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const departamento = await prisma.departamento.findUnique({
      where: { id },
      include: {
        usuarios: {
          select: {
            id: true,
            nombreCompleto: true,
            email: true,
            rol: true,
            estaActivo: true
          },
          where: { estaActivo: true }
        },
        categorias: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            color: true,
            estaActivo: true
          },
          where: { estaActivo: true }
        },
        _count: {
          select: {
            usuarios: true,
            tickets: true,
            categorias: true
          }
        }
      }
    });

    if (!departamento) {
      return res.status(404).json({
        error: 'Departamento no encontrado'
      });
    }

    res.json({ departamento });

  } catch (error) {
    logger.error('❌ Error obteniendo departamento:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener departamento'
    });
  }
};

/**
 * Actualizar departamento
 */
const actualizarDepartamento = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, color } = req.body;

    const departamento = await prisma.departamento.update({
      where: { id },
      data: {
        nombre,
        descripcion,
        color
      },
      include: {
        _count: {
          select: {
            usuarios: true,
            tickets: true,
            categorias: true
          }
        }
      }
    });

    logger.info(`✅ Departamento actualizado: ${nombre}`);

    res.json({
      message: 'Departamento actualizado exitosamente',
      departamento
    });

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Nombre duplicado',
        message: 'Ya existe un departamento con este nombre'
      });
    }

    logger.error('❌ Error actualizando departamento:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al actualizar departamento'
    });
  }
};

/**
 * Desactivar departamento
 */
const desactivarDepartamento = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que no tenga usuarios activos
    const usuariosActivos = await prisma.usuario.count({
      where: {
        departamentoId: id,
        estaActivo: true
      }
    });

    if (usuariosActivos > 0) {
      return res.status(400).json({
        error: 'No se puede desactivar',
        message: `El departamento tiene ${usuariosActivos} usuarios activos`
      });
    }

    const departamento = await prisma.departamento.update({
      where: { id },
      data: { estaActivo: false }
    });

    logger.info(`✅ Departamento desactivado: ${departamento.nombre}`);

    res.json({
      message: 'Departamento desactivado exitosamente',
      departamento
    });

  } catch (error) {
    logger.error('❌ Error desactivando departamento:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al desactivar departamento'
    });
  }
};

/**
 * Obtener usuarios del departamento
 */
const obtenerUsuarios = async (req, res) => {
  try {
    const { id } = req.params;

    const usuarios = await prisma.usuario.findMany({
      where: {
        departamentoId: id,
        estaActivo: true
      },
      select: {
        id: true,
        nombreCompleto: true,
        email: true,
        rol: true,
        ultimoLogin: true,
        creadoEn: true
      },
      orderBy: { nombreCompleto: 'asc' }
    });

    res.json({ usuarios });

  } catch (error) {
    logger.error('❌ Error obteniendo usuarios del departamento:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener usuarios'
    });
  }
};

/**
 * Obtener categorías del departamento
 */
const obtenerCategorias = async (req, res) => {
  try {
    const { id } = req.params;

    const categorias = await prisma.categoria.findMany({
      where: {
        departamentoId: id,
        estaActivo: true
      },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        color: true,
        icono: true,
        _count: {
          select: {
            tickets: true
          }
        }
      },
      orderBy: { nombre: 'asc' }
    });

    res.json({ categorias });

  } catch (error) {
    logger.error('❌ Error obteniendo categorías del departamento:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener categorías'
    });
  }
};

module.exports = {
  obtenerDepartamentos,
  crearDepartamento,
  obtenerDepartamentoPorId,
  actualizarDepartamento,
  desactivarDepartamento,
  obtenerUsuarios,
  obtenerCategorias
};