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

    // Buscar código de verificación
    const codigosQuery = await db.collection('codigosVerificacion')
      .where('email', '==', emailNormalizado)
      .where('codigo', '==', codigo)
      .where('usado', '==', false)
      .limit(1)
      .get();

    if (codigosQuery.empty) {
      return res.status(400).json({ 
        error: 'Código inválido o ya utilizado' 
      });
    }

    const codigoDoc = codigosQuery.docs[0];
    const codigoData = codigoDoc.data();

    // Verificar que el código no haya expirado
    const ahora = Timestamp.now();
    const fechaExpiracion = codigoData.fechaExpiracion as Timestamp;

    if (ahora.toMillis() > fechaExpiracion.toMillis()) {
      // Marcar como usado aunque haya expirado
      await codigoDoc.ref.update({ usado: true });
      
      return res.status(400).json({ 
        error: 'El código ha expirado. Solicita uno nuevo.' 
      });
    }

    // Marcar código como usado
    await codigoDoc.ref.update({ usado: true });

    // Actualizar usuario en Firestore para marcar email como verificado
    const usuariosQuery = await db.collection('usuarios')
      .where('email', '==', emailNormalizado)
      .limit(1)
      .get();

    if (!usuariosQuery.empty) {
      const usuarioDoc = usuariosQuery.docs[0];
      await usuarioDoc.ref.update({
        emailVerificado: true,
        fechaVerificacionEmail: Timestamp.now()
      });
    }

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

