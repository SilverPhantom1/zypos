import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

    // Construir la preferencia de pago
    const preferencia = {
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
      binary_mode: false
    };

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
      const errorData = await response.json();
      console.error('Error de MercadoPago:', errorData);
      return res.status(response.status).json({ 
        error: errorData.message || 'Error al crear preferencia de pago en MercadoPago',
        details: errorData
      });
    }

    const data = await response.json();

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
