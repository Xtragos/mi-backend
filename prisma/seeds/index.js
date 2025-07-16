/**
 * Seeder principal para poblar la base de datos
 * Crea usuarios, departamentos y categorías iniciales
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/**
 * Función principal de seeding
 */
async function main() {
  console.log('🌱 Iniciando población de base de datos...');

  try {
    // Crear departamentos
    const departamentos = await Promise.all([
    
      prisma.departamento.upsert({
        where: { nombre: 'Soporte Técnico' },
        update: {},
        create: {
          nombre: 'Soporte Técnico',
          descripcion: 'Atención de problemas técnicos y mantenimiento de equipos',
          color: '#3B82F6'
        }
      }),
      prisma.departamento.upsert({
        where: { nombre: 'Servicios Generales' },
        update: {},
        create: {
          nombre: 'Servicios Generales',
          descripcion: 'Mantenimiento de instalaciones y servicios básicos',
          color: '#10B981'
        }
      }),
      prisma.departamento.upsert({
        where: { nombre: 'Seguridad' },
        update: {},
        create: {
          nombre: 'Seguridad',
          descripcion: 'Vigilancia y control de acceso',
          color: '#F59E0B'
        }
      })
    ]);

    console.log('✅ Departamentos creados');

    // Crear categorías
    const categorias = await Promise.all([
      // Soporte Técnico
      prisma.categoria.upsert({
        where: { 
          nombre_departamentoId: {
            nombre: 'Hardware',
            departamentoId: departamentos[0].id
          }
        },
        update: {},
        create: {
          nombre: 'Hardware',
          descripcion: 'Problemas con equipos de cómputo',
          color: '#EF4444',
          icono: 'monitor',
          departamentoId: departamentos[0].id
        }
      }),
      prisma.categoria.upsert({
        where: { 
          nombre_departamentoId: {
            nombre: 'Software',
            departamentoId: departamentos[0].id
          }
        },
        update: {},
        create: {
          nombre: 'Software',
          descripcion: 'Problemas con aplicaciones y sistemas',
          color: '#8B5CF6',
          icono: 'code',
          departamentoId: departamentos[0].id
        }
      }),
      prisma.categoria.upsert({
        where: { 
          nombre_departamentoId: {
            nombre: 'Red',
            departamentoId: departamentos[0].id
          }
        },
        update: {},
        create: {
          nombre: 'Red',
          descripcion: 'Problemas de conectividad y red',
          color: '#06B6D4',
          icono: 'wifi',
          departamentoId: departamentos[0].id
        }
      }),

      // Servicios Generales
      prisma.categoria.upsert({
        where: { 
          nombre_departamentoId: {
            nombre: 'Limpieza',
            departamentoId: departamentos[1].id
          }
        },
        update: {},
        create: {
          nombre: 'Limpieza',
          descripcion: 'Servicios de aseo y limpieza',
          color: '#84CC16',
          icono: 'spray-can',
          departamentoId: departamentos[1].id
        }
      }),
      prisma.categoria.upsert({
        where: { 
          nombre_departamentoId: {
            nombre: 'Mantenimiento',
            departamentoId: departamentos[1].id
          }
        },
        update: {},
        create: {
          nombre: 'Mantenimiento',
          descripcion: 'Reparaciones y mantenimiento preventivo',
          color: '#F97316',
          icono: 'wrench',
          departamentoId: departamentos[1].id
        }
      }),

      // Seguridad
      prisma.categoria.upsert({
        where: { 
          nombre_departamentoId: {
            nombre: 'Control de Acceso',
            departamentoId: departamentos[2].id
          }
        },
        update: {},
        create: {
          nombre: 'Control de Acceso',
          descripcion: 'Gestión de accesos y llaves',
          color: '#DC2626',
          icono: 'key',
          departamentoId: departamentos[2].id
        }
      })
    ]);

    console.log('✅ Categorías creadas');

    // Hash de contraseñas
    const saltRounds = 12;
    const adminPassword = await bcrypt.hash('Admin123!', saltRounds);
    const jefePassword = await bcrypt.hash('Jefe123!', saltRounds);
    const agentePassword = await bcrypt.hash('Agente123!', saltRounds);
    const clientePassword = await bcrypt.hash('Cliente123!', saltRounds);

    // Crear usuarios
    const usuarios = await Promise.all([
      // Administrador
      prisma.usuario.upsert({
        where: { email: 'admin@helpdesk.com' },
        update: {},
        create: {
          email: 'admin@helpdesk.com',
          password: adminPassword,
          nombreCompleto: 'Administrador del Sistema',
          telefono: '+507 6000-0000',
          rol: 'ADMIN',
          estaActivo: true
        }
      }),

      // Jefe de Soporte Técnico
      prisma.usuario.upsert({
        where: { email: 'jefe.soporte@helpdesk.com' },
        update: {},
        create: {
          email: 'jefe.soporte@helpdesk.com',
          password: jefePassword,
          nombreCompleto: 'Carlos Rodríguez',
          telefono: '+507 6000-0001',
          rol: 'JEFE_DEPARTAMENTO',
          departamentoId: departamentos[0].id,
          estaActivo: true
        }
      }),

      // Jefe de Servicios Generales
      prisma.usuario.upsert({
        where: { email: 'jefe.servicios@helpdesk.com' },
        update: {},
        create: {
          email: 'jefe.servicios@helpdesk.com',
          password: jefePassword,
          nombreCompleto: 'María González',
          telefono: '+507 6000-0002',
          rol: 'JEFE_DEPARTAMENTO',
          departamentoId: departamentos[1].id,
          estaActivo: true
        }
      }),

      // Agentes de Soporte Técnico
      prisma.usuario.upsert({
        where: { email: 'agente1@helpdesk.com' },
        update: {},
        create: {
          email: 'agente1@helpdesk.com',
          password: agentePassword,
          nombreCompleto: 'Pedro Martínez',
          telefono: '+507 6000-0003',
          rol: 'AGENTE',
          departamentoId: departamentos[0].id,
          estaActivo: true
        }
      }),

      prisma.usuario.upsert({
        where: { email: 'agente2@helpdesk.com' },
        update: {},
        create: {
          email: 'agente2@helpdesk.com',
          password: agentePassword,
          nombreCompleto: 'Ana López',
          telefono: '+507 6000-0004',
          rol: 'AGENTE',
          departamentoId: departamentos[1].id,
          estaActivo: true
        }
      }),

      // Cliente de prueba
      prisma.usuario.upsert({
        where: { email: 'cliente@test.com' },
        update: {},
        create: {
          email: 'cliente@test.com',
          password: clientePassword,
          nombreCompleto: 'Cliente de Prueba',
          telefono: '+507 6000-0005',
          rol: 'CLIENTE',
          estaActivo: true
        }
      })
    ]);

    console.log('✅ Usuarios creados');

    // Crear proyecto de ejemplo
    const proyecto = await prisma.proyecto.upsert({
      where: { nombre: 'Modernización Oficinas' },
      update: {},
      create: {
        nombre: 'Modernización Oficinas',
        descripcion: 'Proyecto de actualización tecnológica de las oficinas principales',
        fechaInicio: new Date('2024-01-01'),
        fechaFin: new Date('2024-12-31'),
        presupuesto: 50000.00,
        estaActivo: true
      }
    });

    console.log('✅ Proyecto creado');

    // Crear tickets de ejemplo
    const tickets = await Promise.all([
      prisma.ticket.create({
        data: {
          numeroTicket: '2024-01-000001',
          asunto: 'Problema con impresora del piso 3',
          descripcion: 'La impresora no responde y muestra error en pantalla. Necesita revisión urgente.',
          prioridad: 'ALTA',
          estado: 'ABIERTO',
          creadorId: usuarios[5].id, // Cliente
          departamentoId: departamentos[0].id, // Soporte Técnico
          categoriaId: categorias[0].id, // Hardware
          ubicacion: 'Oficina 301, Piso 3',
          coordenadas: '8.9824,-79.5199'
        }
      }),

      prisma.ticket.create({
        data: {
          numeroTicket: '2024-01-000002',
          asunto: 'Solicitud de limpieza de sala de reuniones',
          descripcion: 'Programar limpieza profunda para la sala de reuniones principal antes del evento del viernes.',
          prioridad: 'MEDIA',
          estado: 'EN_PROGRESO',
          creadorId: usuarios[5].id, // Cliente
          agenteId: usuarios[4].id, // Agente Ana López
          departamentoId: departamentos[1].id, // Servicios Generales
          categoriaId: categorias[3].id, // Limpieza
          ubicacion: 'Sala de Reuniones A, Piso 2',
          proyectoId: proyecto.id
        }
      })
    ]);

    console.log('✅ Tickets de ejemplo creados');

    // Crear comentarios de ejemplo
    await Promise.all([
      prisma.comentario.create({
        data: {
          contenido: 'Ticket recibido. Agendaremos revisión para hoy en la tarde.',
          autorId: usuarios[1].id, // Jefe de Soporte
          ticketId: tickets[0].id,
          esInterno: false
        }
      }),

      prisma.comentario.create({
        data: {
          contenido: 'Cleaning scheduled for tomorrow at 6 AM.',
          autorId: usuarios[4].id, // Agente Ana
          ticketId: tickets[1].id,
          esInterno: false
        }
      })
    ]);

    console.log('✅ Comentarios creados');

    // Crear artículos de base de conocimiento
    await Promise.all([
      prisma.baseConocimiento.create({
        data: {
          titulo: 'Cómo reiniciar una impresora HP',
          contenido: `
## Pasos para reiniciar impresora HP

1. **Apagar la impresora** completamente usando el botón de encendido
2. **Desconectar** el cable de alimentación por 30 segundos
3. **Reconectar** el cable y encender la impresora
4. **Esperar** que complete el proceso de inicialización
5. **Imprimir página de prueba** para verificar funcionamiento

### Códigos de error comunes:
- **Error 50**: Problema de fusor
- **Error 79**: Error de firmware
- **Error 49**: Error de memoria

Si el problema persiste, contactar soporte técnico.
          `,
          etiquetas: ['impresora', 'hp', 'reinicio', 'troubleshooting'],
          autorId: usuarios[1].id,
          esPublico: true
        }
      }),

      prisma.baseConocimiento.create({
        data: {
          titulo: 'Protocolo de limpieza de oficinas',
          contenido: `
## Protocolo estándar de limpieza

### Frecuencia diaria:
- Vaciado de cestas de basura
- Limpieza de escritorios
- Aspirado de alfombras
- Limpieza de baños

### Frecuencia semanal:
- Limpieza profunda de ventanas
- Desinfección de áreas comunes
- Limpieza de cocina/cafetería

### Materiales necesarios:
- Desinfectante multiuso
- Paños de microfibra
- Aspiradora
- Productos especializados por superficie
          `,
          etiquetas: ['limpieza', 'protocolo', 'oficina'],
          autorId: usuarios[2].id,
          esPublico: true
        }
      })
    ]);

    console.log('✅ Base de conocimiento creada');

    console.log('🎉 Población de base de datos completada exitosamente!');
    console.log('\n📋 CREDENCIALES CREADAS:');
    console.log('==========================================');
    console.log('🔑 Admin: admin@helpdesk.com / Admin123!');
    console.log('👥 Jefe Soporte: jefe.soporte@helpdesk.com / Jefe123!');
    console.log('👥 Jefe Servicios: jefe.servicios@helpdesk.com / Jefe123!');
    console.log('🔧 Agente 1: agente1@helpdesk.com / Agente123!');
    console.log('🔧 Agente 2: agente2@helpdesk.com / Agente123!');
    console.log('👤 Cliente: cliente@test.com / Cliente123!');
    console.log('==========================================\n');

  } catch (error) {
    console.error('❌ Error en seeding:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });