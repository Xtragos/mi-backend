/**
 * Controlador de categorías
 * Maneja CRUD de categorías por departamento
 */

const { PrismaClient } = require('@prisma/client');
const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Obtener lista de categorías
 */
const obtenerCategorias = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      departamentoId,
      estaActivo = true,
      buscar
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (departamentoId) where.departamentoId = departamentoId;
    if (estaActivo !== undefined) where.estaActivo = estaActivo === 'true';

    if (buscar) {
      where.OR = [
        { nombre: { contains: buscar, mode: 'insensitive' } },
        { descripcion: { contains: buscar, mode: 'insensitive' } }
      ];
    }

    // Filtro por departamento si es jefe de departamento
    if (req.usuario.rol === 'JEFE_DEPARTAMENTO') {
      where.departamentoId = req.usuario.departamentoId;
    }

    const [categorias, total] = await Promise.all([
      prisma.categoria.findMany({
        where,
        include: {
          departamento: {
            select: {
              id: true,
              nombre: true,
              color: true
            }
          },
          _count: {
            select: {
              tickets: true
            }
          }
        },
        orderBy: [
          { departamento: { nombre: 'asc' } },
          { nombre: 'asc' }
        ],
        skip: offset,
        take: parseInt(limit)
      }),
      prisma.categoria.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      categorias,
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
    logger.error('❌ Error obteniendo categorías:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener categorías'
    });
  }
};

/**
 * Crear nueva categoría
 */
const crearCategoria = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
    }

    const { nombre, descripcion, departamentoId, color, icono } = req.body;

    // Verificar que el departamento existe
    const departamento = await prisma.departamento.findUnique({
      where: { id: departamentoId }
    });

    if (!departamento) {
      return res.status(404).json({
        error: 'Departamento no encontrado'
      });
    }

    const categoria = await prisma.categoria.create({
      data: {
        nombre,
        descripcion,
        departamentoId,
        color: color || '#10B981',
        icono
      },
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

    logger.info(`✅ Categoría creada: ${nombre} en ${departamento.nombre}`);

    res.status(201).json({
      message: 'Categoría creada exitosamente',
      categoria
    });

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Nombre duplicado',
        message: 'Ya existe una categoría con este nombre en el departamento'
      });
    }

    logger.error('❌ Error creando categoría:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al crear categoría'
    });
  }
};

/**
 * Obtener categoría por ID
 */
const obtenerCategoriaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const categoria = await prisma.categoria.findUnique({
      where: { id },
      include: {
        departamento: {
          select: {
            id: true,
            nombre: true,
            color: true
          }
        },
        tickets: {
          select: {
            id: true,
            numeroTicket: true,
            asunto: true,
            estado: true,
            prioridad: true,
            creadoEn: true
          },
          take: 10,
          orderBy: { creadoEn: 'desc' }
        },
        _count: {
          select: {
            tickets: true
          }
        }
      }
    });

    if (!categoria) {
      return res.status(404).json({
        error: 'Categoría no encontrada'
      });
    }

    res.json({ categoria });

  } catch (error) {
    logger.error('❌ Error obteniendo categoría:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener categoría'
    });
  }
};

/**
 * Actualizar categoría
 */
const actualizarCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, color, icono } = req.body;

    const categoria = await prisma.categoria.update({
      where: { id },
      data: {
        nombre,
        descripcion,
        color,
        icono
      },
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

    logger.info(`✅ Categoría actualizada: ${nombre}`);

    res.json({
      message: 'Categoría actualizada exitosamente',
      categoria
    });

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Nombre duplicado',
        message: 'Ya existe una categoría con este nombre en el departamento'
      });
    }

    logger.error('❌ Error actualizando categoría:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al actualizar categoría'
    });
  }
};

/**
 * Desactivar categoría
 */
const desactivarCategoria = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que no tenga tickets activos
    const ticketsActivos = await prisma.ticket.count({
      where: {
        categoriaId: id,
        estado: {
          in: ['ABIERTO', 'EN_PROGRESO', 'EN_ESPERA']
        }
      }
    });

    if (ticketsActivos > 0) {
      return res.status(400).json({
        error: 'No se puede desactivar',
        message: `La categoría tiene ${ticketsActivos} tickets activos`
      });
    }

    const categoria = await prisma.categoria.update({
      where: { id },
      data: { estaActivo: false }
    });

    logger.info(`✅ Categoría desactivada: ${categoria.nombre}`);

    res.json({
      message: 'Categoría desactivada exitosamente',
      categoria
    });

  } catch (error) {
    logger.error('❌ Error desactivando categoría:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al desactivar categoría'
    });
  }
};

module.exports = {
  obtenerCategorias,
  crearCategoria,
  obtenerCategoriaPorId,
  actualizarCategoria,
  desactivarCategoria
};