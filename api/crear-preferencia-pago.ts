import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

interface MercadoPagoPreferenceResponse {
  id: string;
  init_point: string;
  [key: string]: any;
}

interface MercadoPagoErrorResponse {
  message?: string;
  cause?: Array<{ description?: string }>;
  [key: string]: any;
}

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
  // Configurar headers CORS - DEBE IR AL INICIO
  const origin = req.headers.origin || '*';
  
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  // Manejar preflight (OPTIONS) - DEBE SER LO PRIMERO
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Solo permitir métodos POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { monto, descripcion, userId, planId, baseUrl } = req.body;

    // Validar parámetros requeridos
    if (!monto || !descripcion || !userId || !planId) {
      return res.status(400).json({ 
        error: 'Faltan parámetros requeridos: monto, descripcion, userId, planId' 
      });
    }

    // Obtener credenciales de MercadoPago desde Firestore
    const db = getFirestore();
    const configDoc = await db.collection('configuracion').doc('mercadoPago').get();

    if (!configDoc.exists) {
      return res.status(500).json({ 
        error: 'Credenciales de MercadoPago no configuradas en Firestore' 
      });
    }

    const configData = configDoc.data();
    const accessToken = configData?.accessToken;
    // Permitir forzar modo test desde Firestore
    const modoTestForzado = configData?.modoTest === true;

    if (!accessToken) {
      return res.status(500).json({ 
        error: 'Access Token de MercadoPago no configurado' 
      });
    }

    // Validar y convertir el monto
    const montoNumerico = Number(monto);
    if (isNaN(montoNumerico) || montoNumerico <= 0) {
      return res.status(400).json({ error: 'El monto debe ser un número válido mayor a 0' });
    }

    const montoEntero = Math.round(montoNumerico);
    const urlBase = baseUrl || 'https://tu-dominio.com';

    // Verificar si es modo test
    // Los tokens de prueba pueden empezar con "TEST-" o "APP_USR-" dependiendo de la versión
    // Si está en la pestaña "Prueba" de MercadoPago, es modo test aunque empiece con APP_USR-
    const isTestMode = modoTestForzado || accessToken.startsWith('TEST-');
    
    console.log('Modo test detectado:', isTestMode);
    console.log('Modo test forzado desde Firestore:', modoTestForzado);
    console.log('Access Token (primeros 15 caracteres):', accessToken.substring(0, 15));

    // Construir la preferencia de pago
    const preferencia: any = {
      items: [
        {
          title: descripcion,
          quantity: 1,
          unit_price: montoEntero,
          currency_id: 'CLP'
        }
      ],
      back_urls: {
        success: `${urlBase}/planes?payment_status=approved&user_id=${userId}&plan_id=${planId}`,
        failure: `${urlBase}/planes?payment_status=failure&user_id=${userId}&plan_id=${planId}`,
        pending: `${urlBase}/planes?payment_status=pending&user_id=${userId}&plan_id=${planId}`
      },
      external_reference: `plan_${planId}_user_${userId}_${Date.now()}`,
      statement_descriptor: 'ZYPOS PLAN',
      binary_mode: false,
      // Configuración específica para evitar el error de "partes de prueba"
      auto_return: 'approved' // Redirigir automáticamente cuando se apruebe
      // NOTA: No especificamos 'payer' para permitir pagos como invitado
      // El usuario ingresará su email en el checkout de MercadoPago
    };
    
    console.log('Preferencia creada:', JSON.stringify(preferencia, null, 2));

    // Llamar a la API de MercadoPago
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Idempotency-Key': `${userId}_${planId}_${Date.now()}`
      },
      body: JSON.stringify(preferencia)
    });

    if (!response.ok) {
      const errorData = await response.json() as MercadoPagoErrorResponse;
      console.error('Error de MercadoPago:', errorData);
      return res.status(response.status).json({ 
        error: errorData.message || 'Error al crear preferencia de pago en MercadoPago',
        details: errorData
      });
    }

    const data = await response.json() as MercadoPagoPreferenceResponse;

    if (!data.init_point) {
      return res.status(500).json({ 
        error: 'La preferencia se creó pero no se obtuvo la URL del checkout' 
      });
    }

    return res.status(200).json({ 
      init_point: data.init_point,
      preference_id: data.id
    });

  } catch (error: any) {
    console.error('Error en crear-preferencia-pago:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
}

