/**
 * Middleware de upload de archivos
 * Configuración de Multer para manejo seguro de archivos
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');
const { sanitizeFilename } = require('../utils/helpers');

// Crear directorios de upload si no existen
const uploadDir = process.env.UPLOAD_PATH || path.join(__dirname, '../../uploads');
const avatarDir = path.join(uploadDir, 'avatars');
const documentsDir = path.join(uploadDir, 'documents');
const imagesDir = path.join(uploadDir, 'images');
const tempDir = path.join(uploadDir, 'temp');

[uploadDir, avatarDir, documentsDir, imagesDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`📁 Directorio creado: ${dir}`);
  }
});

/**
 * Configuración de almacenamiento general
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = uploadDir;

    // Determinar directorio según el tipo de archivo o ruta
    if (req.route && req.route.path.includes('avatar')) {
      uploadPath = avatarDir;
    } else if (file.mimetype.startsWith('image/')) {
      uploadPath = imagesDir;
    } else {
      uploadPath = documentsDir;
    }

    cb(null, uploadPath);
  },
  
  filename: (req, file, cb) => {
    // Generar nombre único y seguro
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = sanitizeFilename(path.basename(file.originalname, extension)) || 'file';
    
    const filename = `${timestamp}_${randomString}_${safeName}${extension}`;
    
    cb(null, filename);
  }
});

/**
 * Configuración de almacenamiento para avatares
 */
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const userId = req.params.id || req.usuario?.id || 'unknown';
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = `avatar_${userId}_${timestamp}${extension}`;
    cb(null, filename);
  }
});

/**
 * Filtro de archivos permitidos
 */
const fileFilter = (req, file, cb) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'image/jpeg',
    'image/png', 
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  // Verificar tipo MIME
  if (!allowedTypes.includes(file.mimetype)) {
    logger.warn(`🚫 Tipo de archivo no permitido: ${file.mimetype} (${file.originalname})`);
    return cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
  }

  // Log del archivo aceptado
  logger.info(`📎 Archivo aceptado: ${file.originalname} (${file.mimetype})`);
  cb(null, true);
};

/**
 * Filtro específico para avatares (solo imágenes)
 */
const avatarFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    logger.warn(`🚫 Solo imágenes permitidas para avatares: ${file.mimetype}`);
    return cb(new Error('Solo se permiten imágenes para avatares'), false);
  }

  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (!allowedImageTypes.includes(file.mimetype)) {
    return cb(new Error('Formato de imagen no soportado'), false);
  }

  cb(null, true);
};

/**
 * Configuración principal de Multer
 */
const uploadConfig = {
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 5, // Máximo 5 archivos por request
    fields: 10 // Máximo 10 campos de formulario
  }
};

/**
 * Configuración para avatares
 */
const avatarConfig = {
  storage: avatarStorage,
  fileFilter: avatarFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB para avatares
    files: 1
  }
};

/**
 * Instancias de Multer
 */
const upload = multer(uploadConfig);
const avatarUpload = multer(avatarConfig);

/**
 * Middleware de manejo de errores de Multer
 */
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    logger.error('❌ Error de Multer:', error);
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(413).json({
          error: 'Archivo demasiado grande',
          message: `El archivo excede el tamaño máximo de ${Math.round(parseInt(process.env.MAX_FILE_SIZE || 10485760) / 1024 / 1024)}MB`
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Demasiados archivos',
          message: 'Se excedió el número máximo de archivos permitidos (5)'
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Campo inesperado',
          message: 'El archivo se envió en un campo no esperado'
        });
      
      default:
        return res.status(400).json({
          error: 'Error de upload',
          message: error.message || 'Error desconocido al subir archivo'
        });
    }
  }

  // Error personalizado (tipo de archivo no permitido)
  if (error.message && (error.message.includes('Tipo de archivo no permitido') || 
                        error.message.includes('Solo se permiten imágenes'))) {
    return res.status(400).json({
      error: 'Tipo de archivo no permitido',
      message: error.message
    });
  }

  next(error);
};

/**
 * Middleware para validar archivos después del upload
 */
const validateUploadedFile = (req, res, next) => {
  if (!req.file && !req.files) {
    return next();
  }

  const files = req.files || [req.file];
  
  files.forEach(file => {
    if (file) {
      // Validación adicional del contenido del archivo
      const extension = path.extname(file.originalname).toLowerCase();
      const mimeType = file.mimetype;

      // Verificar consistencia entre extensión y MIME type
      const mimeExtensionMap = {
        '.jpg': ['image/jpeg'],
        '.jpeg': ['image/jpeg'],
        '.png': ['image/png'],
        '.gif': ['image/gif'],
        '.pdf': ['application/pdf'],
        '.txt': ['text/plain'],
        '.doc': ['application/msword'],
        '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      };

      if (mimeExtensionMap[extension] && !mimeExtensionMap[extension].includes(mimeType)) {
        logger.warn(`⚠️ Inconsistencia detectada: ${file.originalname} (ext: ${extension}, mime: ${mimeType})`);
      }

      logger.info(`✅ Archivo validado: ${file.originalname} (${file.size} bytes)`);
    }
  });

  next();
};

/**
 * Middleware para agregar información adicional del archivo
 */
const enrichFileInfo = (req, res, next) => {
  if (req.file) {
    req.file.info = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      extension: path.extname(req.file.originalname).toLowerCase(),
      isImage: req.file.mimetype.startsWith('image/'),
      uploadedAt: new Date()
    };
  }

  if (req.files && Array.isArray(req.files)) {
    req.files.forEach(file => {
      file.info = {
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        extension: path.extname(file.originalname).toLowerCase(),
        isImage: file.mimetype.startsWith('image/'),
        uploadedAt: new Date()
      };
    });
  }

  next();
};

/**
 * Middleware para limpiar archivos en caso de error
 */
const cleanupOnError = (req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;

  const cleanup = () => {
    if (res.statusCode >= 400 && (req.file || req.files)) {
      const files = req.files || [req.file];
      
      files.forEach(file => {
        if (file && file.path && fs.existsSync(file.path)) {
          fs.unlink(file.path, (err) => {
            if (err) {
              logger.error(`❌ Error eliminando archivo temporal: ${file.path}`, err);
            } else {
              logger.info(`🗑️ Archivo temporal eliminado: ${file.path}`);
            }
          });
        }
      });
    }
  };

  res.send = function(...args) {
    cleanup();
    return originalSend.apply(this, args);
  };

  res.json = function(...args) {
    cleanup();
    return originalJson.apply(this, args);
  };

  next();
};

/**
 * Función para eliminar archivo del disco
 */
const deleteFile = async (filename, type = 'general') => {
  try {
    let filePath;
    
    switch (type) {
      case 'avatar':
        filePath = path.join(avatarDir, filename);
        break;
      case 'image':
        filePath = path.join(imagesDir, filename);
        break;
      case 'document':
        filePath = path.join(documentsDir, filename);
        break;
      default:
        filePath = path.join(uploadDir, filename);
    }

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.info(`🗑️ Archivo eliminado: ${filename}`);
      return true;
    } else {
      logger.warn(`⚠️ Archivo no encontrado: ${filePath}`);
      return false;
    }
  } catch (error) {
    logger.error(`❌ Error eliminando archivo ${filename}:`, error);
    throw error;
  }
};

// Crear middleware combinados
const createUploadMiddleware = (uploadInstance, middlewares = []) => {
  return [uploadInstance, handleMulterError, validateUploadedFile, enrichFileInfo, cleanupOnError, ...middlewares];
};

module.exports = {
  // Instancias base de multer
  upload,
  avatarUpload,
  
  // Middleware individuales
  handleMulterError,
  validateUploadedFile,
  enrichFileInfo,
  cleanupOnError,
  
  // Configuraciones listas para usar
  single: createUploadMiddleware(upload.single('archivo')),
  avatar: createUploadMiddleware(avatarUpload.single('avatar')),
  multiple: createUploadMiddleware(upload.array('archivos', 5)),
  any: createUploadMiddleware(upload.any()),
  
  // Utilidades
  deleteFile,
  uploadDir,
  avatarDir,
  imagesDir,
  documentsDir,
  tempDir
};