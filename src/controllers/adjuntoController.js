/**
 * Controlador de adjuntos
 * Maneja upload, descarga y gestión de archivos
 */

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');
const { sanitizeFilename, formatBytes } = require('../utils/helpers');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

const prisma = new PrismaClient();

/**
 * Subir archivo adjunto
 */
const subirAdjunto = async (req, res) => {
  try {
    const { id: ticketId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        error: 'Archivo requerido',
        message: 'Debe proporcionar un archivo'
      });
    }

    const { filename, originalname, mimetype, size, path: filePath } = req.file;

    // Verificar si es imagen
    const esImagen = mimetype.startsWith('image/');
    let ancho = null;
    let alto = null;

    // Obtener dimensiones si es imagen
    if (esImagen) {
      try {
        const metadata = await sharp(filePath).metadata();
        ancho = metadata.width;
        alto = metadata.height;

        // Redimensionar si es muy grande (max 1920x1080)
        if (ancho > 1920 || alto > 1080) {
          await sharp(filePath)
            .resize(1920, 1080, { 
              fit: 'inside',
              withoutEnlargement: true 
            })
            .jpeg({ quality: 85 })
            .toFile(filePath + '_resized');

          // Reemplazar archivo original
          await fs.rename(filePath + '_resized', filePath);
          
          const newMetadata = await sharp(filePath).metadata();
          ancho = newMetadata.width;
          alto = newMetadata.height;
        }
      } catch (imageError) {
        logger.warn('⚠️ Error procesando imagen:', imageError);
      }
    }

    // Crear registro en base de datos
    const adjunto = await prisma.adjunto.create({
      data: {
        nombreArchivo: filename,
        nombreOriginal: originalname,
        tipoMime: mimetype,
        tamanio: size,
        ruta: `uploads/${filename}`,
        esImagen,
        ancho,
        alto,
        ticketId,
        subidoPorId: req.usuario.id
      },
      include: {
        subidoPor: {
          select: {
            id: true,
            nombreCompleto: true
          }
        }
      }
    });

    logger.info(`✅ Adjunto subido: ${originalname} (${formatBytes(size)})`);

    res.status(201).json({
      message: 'Archivo subido exitosamente',
      adjunto
    });

  } catch (error) {
    logger.error('❌ Error subiendo adjunto:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al subir archivo'
    });
  }
};

/**
 * Descargar archivo adjunto
 */
const descargarAdjunto = async (req, res) => {
  try {
    const { id } = req.params;

    const adjunto = await prisma.adjunto.findUnique({
      where: { id },
      include: {
        ticket: {
          select: {
            id: true,
            creadorId: true,
            agenteId: true,
            departamentoId: true
          }
        }
      }
    });

    if (!adjunto) {
      return res.status(404).json({
        error: 'Archivo no encontrado'
      });
    }

    // Verificar permisos de acceso
    const usuario = req.usuario;
    const ticket = adjunto.ticket;

    const tieneAcceso = 
      usuario.rol === 'ADMIN' ||
      (usuario.rol === 'JEFE_DEPARTAMENTO' && ticket.departamentoId === usuario.departamentoId) ||
      (usuario.rol === 'AGENTE' && ticket.agenteId === usuario.id) ||
      (usuario.rol === 'CLIENTE' && ticket.creadorId === usuario.id);

    if (!tieneAcceso) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tiene permisos para acceder a este archivo'
      });
    }

    const filePath = path.join(process.env.UPLOAD_PATH, adjunto.nombreArchivo);

    // Verificar que el archivo existe
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        error: 'Archivo no encontrado en disco',
        message: 'El archivo ha sido eliminado o movido'
      });
    }

    // Configurar headers para descarga
    res.setHeader('Content-Disposition', `attachment; filename="${adjunto.nombreOriginal}"`);
    res.setHeader('Content-Type', adjunto.tipoMime);
    res.setHeader('Content-Length', adjunto.tamanio);

    // Enviar archivo
    res.sendFile(filePath);

    logger.info(`📥 Adjunto descargado: ${adjunto.nombreOriginal} por ${usuario.email}`);

  } catch (error) {
    logger.error('❌ Error descargando adjunto:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al descargar archivo'
    });
  }
};

/**
 * Obtener información del adjunto
 */
const obtenerInfoAdjunto = async (req, res) => {
  try {
    const { id } = req.params;

    const adjunto = await prisma.adjunto.findUnique({
      where: { id },
      include: {
        subidoPor: {
          select: {
            id: true,
            nombreCompleto: true
          }
        },
        ticket: {
          select: {
            id: true,
            numeroTicket: true,
            asunto: true
          }
        }
      }
    });

    if (!adjunto) {
      return res.status(404).json({
        error: 'Archivo no encontrado'
      });
    }

    res.json({ adjunto });

  } catch (error) {
    logger.error('❌ Error obteniendo info de adjunto:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al obtener información del archivo'
    });
  }
};

/**
 * Eliminar adjunto
 */
const eliminarAdjunto = async (req, res) => {
  try {
    const { id } = req.params;

    const adjunto = await prisma.adjunto.findUnique({
      where: { id },
      include: {
        ticket: {
          select: {
            creadorId: true,
            agenteId: true,
            departamentoId: true
          }
        }
      }
    });

    if (!adjunto) {
      return res.status(404).json({
        error: 'Archivo no encontrado'
      });
    }

    // Verificar permisos (solo admin, jefe de depto o quien subió el archivo)
    const usuario = req.usuario;
    const puedeEliminar = 
      usuario.rol === 'ADMIN' ||
      (usuario.rol === 'JEFE_DEPARTAMENTO' && adjunto.ticket.departamentoId === usuario.departamentoId) ||
      adjunto.subidoPorId === usuario.id;

    if (!puedeEliminar) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tiene permisos para eliminar este archivo'
      });
    }

    // Eliminar archivo del disco
    const filePath = path.join(process.env.UPLOAD_PATH, adjunto.nombreArchivo);
    try {
      await fs.unlink(filePath);
    } catch (fileError) {
      logger.warn(`⚠️ No se pudo eliminar archivo del disco: ${filePath}`);
    }

    // Eliminar registro de base de datos
    await prisma.adjunto.delete({
      where: { id }
    });

    logger.info(`✅ Adjunto eliminado: ${adjunto.nombreOriginal} por ${usuario.email}`);

    res.json({
      message: 'Archivo eliminado exitosamente'
    });

  } catch (error) {
    logger.error('❌ Error eliminando adjunto:', error);
    res.status(500).json({
      error: 'Error interno',
      message: 'Error al eliminar archivo'
    });
  }
};

module.exports = {
  subirAdjunto,
  descargarAdjunto,
  obtenerInfoAdjunto,
  eliminarAdjunto
};