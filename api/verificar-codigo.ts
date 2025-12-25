import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Inicializar Firebase Admin solo si no está inicializado
if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (serviceAccount) {
    try {
      initializeApp({
        credential: cert(JSON.parse(serviceAccount))
      });
    } catch (error) {
      console.error('Error inicializando Firebase Admin:', error);
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configurar headers CORS
  const origin = req.headers.origin;
  
  // Permitir localhost para desarrollo y el dominio de producción
  const allowedOrigins = [
    'http://localhost:4200',
    'http://localhost:3000',
    'https://zypos.vercel.app',
    'https://zypos-git-master-dylans-projects-d0c69659.vercel.app'
  ];
  
  const allowedOrigin = origin && allowedOrigins.includes(origin) 
    ? origin 
    : allowedOrigins[2]; // Default a producción
  
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  // Manejar preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Solo permitir método POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { email, codigo } = req.body;

    // Validar parámetros
    if (!email || !codigo) {
      return res.status(400).json({ 
        error: 'Faltan parámetros requeridos: email, codigo' 
      });
    }

    // Validar formato de código (debe ser 6 dígitos)
    if (!/^\d{6}$/.test(codigo)) {
      return res.status(400).json({ 
        error: 'El código debe ser de 6 dígitos' 
      });
    }

    const db = getFirestore();
    const emailNormalizado = email.toLowerCase().trim();
    const codigoNormalizado = codigo.trim(); // Asegurar que el código sea string

    // Buscar código de verificación
    // Primero buscar por email y código sin filtrar por usado, para ver todos los códigos
    const codigosQuery = await db.collection('codigosVerificacion')
      .where('email', '==', emailNormalizado)
      .where('codigo', '==', codigoNormalizado)
      .limit(10) // Obtener más resultados para debug
      .get();

    if (codigosQuery.empty) {
      return res.status(400).json({ 
        error: 'Código inválido. Verifica que hayas ingresado el código correcto.' 
      });
    }

    // Buscar el código no usado más reciente
    const codigoDoc = codigosQuery.docs
      .filter(doc => doc.data().usado === false)
      .sort((a, b) => {
        const fechaA = a.data().fechaCreacion?.toMillis() || 0;
        const fechaB = b.data().fechaCreacion?.toMillis() || 0;
        return fechaB - fechaA; // Más reciente primero
      })[0];

    if (!codigoDoc) {
      // Verificar si todos están usados o expirados
      const todosUsados = codigosQuery.docs.every(doc => doc.data().usado === true);
      if (todosUsados) {
        return res.status(400).json({ 
          error: 'Este código ya fue utilizado. Solicita uno nuevo.' 
        });
      }
      return res.status(400).json({ 
        error: 'Código inválido o ya utilizado' 
      });
    }

    const codigoData = codigoDoc.data();

    // Verificar que el código no haya expirado
    const ahora = Timestamp.now();
    const fechaExpiracion = codigoData.fechaExpiracion as Timestamp;
    const tiempoRestante = fechaExpiracion.toMillis() - ahora.toMillis();

    if (tiempoRestante <= 0) {
      // Marcar como usado aunque haya expirado
      await codigoDoc.ref.update({ usado: true });
      
      return res.status(400).json({ 
        error: 'El código ha expirado. Solicita uno nuevo.' 
      });
    }

    // Marcar código como usado
    await codigoDoc.ref.update({ usado: true });

    // El usuario se creará en el frontend después de verificar el código
    // No intentamos actualizar un usuario que aún no existe

    return res.status(200).json({ 
      success: true,
      message: 'Código verificado exitosamente',
      emailVerificado: true
    });

  } catch (error: any) {
    console.error('Error en verificar-codigo:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
}

