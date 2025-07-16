/**
 * Servicio de gestión de uploads
 * Maneja procesamiento y validación de archivos
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../utils/logger');
const { formatBytes } = require('../utils/helpers');

class UploadService {
  /**
   * Procesar imagen subida
   * @param {string} filePath - Ruta del archivo
   * @param {Object} options - Opciones de procesamiento
   */
  async procesarImagen(filePath, options = {}) {
    try {
      const {
        maxWidth = 1920,
        maxHeight = 1080,
        quality = 85,
        format = 'jpeg'
      } = options;

      // Obtener información de la imagen
      const metadata = await sharp(filePath).metadata();
      
      let needsProcessing = false;
      let processedPath = filePath;

      // Verificar si necesita redimensionamiento
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        needsProcessing = true;
      }

      // Verificar si necesita conversión de formato
      if (format !== metadata.format) {
        needsProcessing = true;
      }

      if (needsProcessing) {
        const extension = format === 'jpeg' ? '.jpg' : `.${format}`;
        processedPath = filePath.replace(path.extname(filePath), `_processed${extension}`);

        await sharp(filePath)
          .resize(maxWidth, maxHeight, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality })
          .toFile(processedPath);

        // Reemplazar archivo original
        await fs.rename(processedPath, filePath);
        
        const newMetadata = await sharp(filePath).metadata();
        
        logger.info(`🖼️ Imagen procesada: ${metadata.width}x${metadata.height} → ${newMetadata.width}x${newMetadata.height}`);
        
        return {
          width: newMetadata.width,
          height: newMetadata.height,
          size: newMetadata.size,
          format: newMetadata.format
        };
      }

      return {
        width: metadata.width,
        height: metadata.height,
        size: metadata.size,
        format: metadata.format
      };

    } catch (error) {
      logger.error('❌ Error procesando imagen:', error);
      throw error;
    }
  }

  /**
   * Validar archivo subido
   * @param {Object} file - Objeto del archivo de Multer
   */
  async validarArchivo(file) {
    try {
      const validaciones = {
        esValido: true,
        errores: [],
        advertencias: []
      };

      // Verificar tamaño
      const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;
      if (file.size > maxSize) {
        validaciones.esValido = false;
        validaciones.errores.push(`Archivo demasiado grande: ${formatBytes(file.size)} (máximo: ${formatBytes(maxSize)})`);
      }

      // Verificar tipo MIME
      const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
        'image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'
      ];

      if (!allowedTypes.includes(file.mimetype)) {
        validaciones.esValido = false;
        validaciones.errores.push(`Tipo de archivo no permitido: ${file.mimetype}`);
      }

      // Verificar extensión vs MIME type
      const extension = path.extname(file.originalname).toLowerCase();
      const expectedMimes = {
        '.jpg': ['image/jpeg'],
        '.jpeg': ['image/jpeg'],
        '.png': ['image/png'],
        '.gif': ['image/gif'],
        '.pdf': ['application/pdf'],
        '.txt': ['text/plain']
      };

      if (expectedMimes[extension] && !expectedMimes[extension].includes(file.mimetype)) {
        validaciones.advertencias.push(`Posible inconsistencia: extensión ${extension} con MIME ${file.mimetype}`);
      }

      // Verificar que el archivo existe
      try {
        await fs.access(file.path);
      } catch {
        validaciones.esValido = false;
        validaciones.errores.push('Archivo no encontrado después del upload');
      }

      return validaciones;

    } catch (error) {
      logger.error('❌ Error validando archivo:', error);
      return {
        esValido: false,
        errores: ['Error interno validando archivo'],
        advertencias: []
      };
    }
  }

  /**
   * Limpiar archivos temporales antiguos
   * @param {string} directorio - Directorio a limpiar
   * @param {number} horasAntiguedad - Horas de antigüedad
   */
  async limpiarArchivosTemporales(directorio, horasAntiguedad = 24) {
    try {
      const archivos = await fs.readdir(directorio);
      const fechaLimite = new Date();
      fechaLimite.setHours(fechaLimite.getHours() - horasAntiguedad);

      let archivosEliminados = 0;

      for (const archivo of archivos) {
        const rutaArchivo = path.join(directorio, archivo);
        
        try {
          const stats = await fs.stat(rutaArchivo);
          
          if (stats.mtime < fechaLimite) {
            await fs.unlink(rutaArchivo);
            archivosEliminados++;
            logger.info(`🗑️ Archivo temporal eliminado: ${archivo}`);
          }
        } catch (error) {
          logger.warn(`⚠️ Error procesando archivo ${archivo}:`, error.message);
        }
      }

      logger.info(`🧹 Limpieza completada: ${archivosEliminados} archivos eliminados de ${directorio}`);
      return archivosEliminados;

    } catch (error) {
      logger.error('❌ Error limpiando archivos temporales:', error);
      throw error;
    }
  }

  /**
   * Obtener información detallada del archivo
   * @param {string} filePath - Ruta del archivo
   */
  async obtenerInfoArchivo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const extension = path.extname(filePath).toLowerCase();
      
      const info = {
        tamaño: stats.size,
        fechaCreacion: stats.birthtime,
        fechaModificacion: stats.mtime,
        extension,
        esImagen: ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)
      };

      // Si es imagen, obtener dimensiones
      if (info.esImagen) {
        try {
          const metadata = await sharp(filePath).metadata();
          info.ancho = metadata.width;
          info.alto = metadata.height;
          info.formato = metadata.format;
          info.hasAlpha = metadata.hasAlpha;
        } catch (imageError) {
          logger.warn('⚠️ Error obteniendo metadata de imagen:', imageError.message);
        }
      }

      return info;

    } catch (error) {
      logger.error('❌ Error obteniendo info de archivo:', error);
      throw error;
    }
  }
}

module.exports = new UploadService();