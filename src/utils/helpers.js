/**
 * Funciones de utilidad para el sistema
 * Contiene helpers reutilizables y lógica común
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

/**
 * Generar número único de ticket
 * Formato: YYYY-MM-XXXXXX (Año-Mes-Secuencial)
 */
const generateTicketNumber = async () => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `${year}-${month}-`;

    // Buscar el último ticket del mes
    const ultimoTicket = await prisma.ticket.findFirst({
      where: {
        numeroTicket: {
          startsWith: prefix
        }
      },
      orderBy: {
        numeroTicket: 'desc'
      }
    });

    let siguiente = 1;
    if (ultimoTicket) {
      const ultimoNumero = ultimoTicket.numeroTicket.split('-')[2];
      siguiente = parseInt(ultimoNumero) + 1;
    }

    const numeroSecuencial = String(siguiente).padStart(6, '0');
    return `${prefix}${numeroSecuencial}`;

  } catch (error) {
    // Fallback con timestamp si hay error
    const timestamp = Date.now().toString().slice(-6);
    return `TEMP-${timestamp}`;
  }
};

/**
 * Validar formato de email
 * @param {string} email - Email a validar
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validar formato de teléfono
 * @param {string} telefono - Teléfono a validar
 * @returns {boolean}
 */
const isValidPhone = (telefono) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(telefono.replace(/[\s\-\(\)]/g, ''));
};

/**
 * Generar código único alfanumérico
 * @param {number} length - Longitud del código (default: 8)
 * @returns {string}
 */
const generateCode = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Calcular hash SHA-256 de un string
 * @param {string} text - Texto a hashear
 * @returns {string}
 */
const generateHash = (text) => {
  return crypto.createHash('sha256').update(text).digest('hex');
};

/**
 * Sanitizar nombre de archivo
 * @param {string} filename - Nombre original del archivo
 * @returns {string}
 */
const sanitizeFilename = (filename) => {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

/**
 * Formatear bytes a formato legible
 * @param {number} bytes - Número de bytes
 * @returns {string}
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validar coordenadas GPS
 * @param {string} coordenadas - String con formato "lat,lng"
 * @returns {boolean}
 */
const isValidCoordinates = (coordenadas) => {
  if (!coordenadas) return false;
  
  const parts = coordenadas.split(',');
  if (parts.length !== 2) return false;
  
  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  
  return !isNaN(lat) && !isNaN(lng) && 
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180;
};

/**
 * Calcular diferencia en días entre fechas
 * @param {Date} fecha1 - Primera fecha
 * @param {Date} fecha2 - Segunda fecha (default: hoy)
 * @returns {number}
 */
const daysDifference = (fecha1, fecha2 = new Date()) => {
  const diffTime = Math.abs(fecha2 - fecha1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Escapar HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string}
 */
const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

/**
 * Truncar texto con puntos suspensivos
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Longitud máxima
 * @returns {string}
 */
const truncateText = (text, maxLength = 100) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Generar slug a partir de texto
 * @param {string} text - Texto a convertir
 * @returns {string}
 */
const generateSlug = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

module.exports = {
  generateTicketNumber,
  isValidEmail,
  isValidPhone,
  generateCode,
  generateHash,
  sanitizeFilename,
  formatBytes,
  isValidCoordinates,
  daysDifference,
  escapeHtml,
  truncateText,
  generateSlug
};