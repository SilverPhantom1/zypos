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
    
    // Obtener email del usuario desde Firestore (necesario para habilitar el botón de pago)
    let userEmail: string | undefined;
    try {
      const userDoc = await db.collection('usuarios').doc(userId).get();
      if (userDoc.exists()) {
        const userData = userDoc.data();
        userEmail = userData?.email || userData?.correo;
      }
    } catch (error) {
      console.warn('No se pudo obtener el email del usuario:', error);
    }
    // Verificar modo test desde Firestore (campo explícito)
    // Si no existe el campo, intentar detectar por el formato del token
    const modoTestExplicito = configData?.modoTest;
    const tieneModoTestDefinido = modoTestExplicito !== undefined;

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
    
    // Validar y limpiar baseUrl
    // MercadoPago requiere URLs válidas (no acepta localhost en producción)
    let urlBase = baseUrl || 'https://tu-dominio.com';
    
    // Si es localhost, usar una URL temporal válida o quitar auto_return
    const esLocalhost = urlBase.includes('localhost') || urlBase.includes('127.0.0.1');
    
    // Detectar modo test:
    // 1. Si hay campo modoTest explícito en Firestore, usar ese valor
    // 2. Si no, detectar por formato: TEST- = test, APP_USR- = producción (por defecto)
    // NOTA: Si tus credenciales de prueba empiezan con APP_USR-, DEBES agregar modoTest: true en Firestore
    let isTestMode: boolean;
    
    if (tieneModoTestDefinido) {
      // Usar el valor explícito de Firestore
      isTestMode = modoTestExplicito === true;
    } else {
      // Detección automática por formato del token
      isTestMode = accessToken.startsWith('TEST-');
    }
    
    console.log('Modo test detectado:', isTestMode);
    console.log('Modo test explícito en Firestore:', tieneModoTestDefinido ? modoTestExplicito : 'no definido');
    console.log('Access Token (primeros 15 caracteres):', accessToken.substring(0, 15));
    console.log('Base URL recibida:', urlBase);
    console.log('Es localhost:', esLocalhost);

    // Construir back_urls - siempre requeridas y válidas
    // Asegurarse de que las URLs estén bien formadas
    const backUrls = {
      success: `${urlBase}/planes?payment_status=approved&user_id=${userId}&plan_id=${planId}`,
      failure: `${urlBase}/planes?payment_status=failure&user_id=${userId}&plan_id=${planId}`,
      pending: `${urlBase}/planes?payment_status=pending&user_id=${userId}&plan_id=${planId}`
    };

    // Construir la preferencia de pago
    // IMPORTANTE: NO incluir auto_return - causa problemas con localhost
    const preferencia: any = {
      items: [
        {
          title: descripcion,
          quantity: 1,
          unit_price: montoEntero,
          currency_id: 'CLP'
        }
      ],
      back_urls: backUrls,
      external_reference: `plan_${planId}_user_${userId}_${Date.now()}`,
      statement_descriptor: 'ZYPOS PLAN',
      binary_mode: false
      // NO incluir auto_return aquí - MercadoPago redirigirá usando back_urls automáticamente
    };
    
    // Agregar email del payer si está disponible (necesario para habilitar el botón de pago)
    if (userEmail) {
      preferencia.payer = {
        email: userEmail
      };
      console.log('Email del payer agregado:', userEmail);
    } else {
      console.warn('⚠️ No se encontró email del usuario - el botón de pago puede estar desactivado');
    }
    
    // Si es modo test, agregar información adicional para debugging
    if (isTestMode) {
      console.log('⚠️ MODO TEST ACTIVO - Usando credenciales de prueba');
      console.log('Las back_urls pueden causar problemas si MercadoPago las valida estrictamente');
    }
    
    console.log('Preferencia creada:', JSON.stringify(preferencia, null, 2));
    console.log('URLs de retorno:', JSON.stringify(backUrls, null, 2));

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

