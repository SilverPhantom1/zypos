import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
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

// Inicializar Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Generar código de verificación de 6 dígitos
function generarCodigoVerificacion(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
    const { email, nombre } = req.body;

    // Validar parámetros
    if (!email || !nombre) {
      return res.status(400).json({ 
        error: 'Faltan parámetros requeridos: email, nombre' 
      });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // Verificar que Resend esté configurado
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ 
        error: 'Servicio de email no configurado. Contacta al administrador.' 
      });
    }

    // Generar código de verificación
    const codigo = generarCodigoVerificacion();
    
    // Calcular fecha de expiración (2 minutos desde ahora)
    const fechaCreacion = Timestamp.now();
    const fechaExpiracion = Timestamp.fromDate(
      new Date(Date.now() + 2 * 60 * 1000) // 2 minutos
    );

    // Guardar código en Firestore
    const db = getFirestore();
    const codigoData = {
      email: email.toLowerCase().trim(),
      codigo: codigo,
      fechaCreacion: fechaCreacion,
      fechaExpiracion: fechaExpiracion,
      usado: false
    };

    // Eliminar códigos anteriores del mismo email
    const codigosAnteriores = await db.collection('codigosVerificacion')
      .where('email', '==', email.toLowerCase().trim())
      .where('usado', '==', false)
      .get();

    const batch = db.batch();
    codigosAnteriores.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Guardar nuevo código
    await db.collection('codigosVerificacion').add(codigoData);

    // Enviar email con Resend
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Zypos <noreply@zypos.com>',
      to: email,
      subject: 'Código de verificación - Zypos',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background: #ffffff;
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 28px;
              font-weight: bold;
              color: #ff6b6b;
              margin-bottom: 10px;
            }
            .code {
              background: #f8f9fa;
              border: 2px dashed #ff6b6b;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              margin: 30px 0;
            }
            .code-number {
              font-size: 32px;
              font-weight: bold;
              color: #ff6b6b;
              letter-spacing: 8px;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              font-size: 12px;
              color: #666;
              text-align: center;
            }
            .warning {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">Zypos</div>
              <h1>Verificación de Email</h1>
            </div>
            
            <p>Hola <strong>${nombre}</strong>,</p>
            
            <p>Gracias por registrarte en Zypos. Para completar tu registro, necesitamos verificar tu dirección de email.</p>
            
            <div class="code">
              <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Tu código de verificación es:</p>
              <div class="code-number">${codigo}</div>
            </div>
            
            <div class="warning">
              <strong>⚠️ Importante:</strong> Este código expirará en 2 minutos. No compartas este código con nadie.
            </div>
            
            <p>Si no solicitaste este código, puedes ignorar este email.</p>
            
            <div class="footer">
              <p>Este es un email automático, por favor no respondas.</p>
              <p>&copy; ${new Date().getFullYear()} Zypos. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Hola ${nombre},
        
        Gracias por registrarte en Zypos. Para completar tu registro, necesitamos verificar tu dirección de email.
        
        Tu código de verificación es: ${codigo}
        
        Este código expirará en 2 minutos. No compartas este código con nadie.
        
        Si no solicitaste este código, puedes ignorar este email.
        
        © ${new Date().getFullYear()} Zypos. Todos los derechos reservados.
      `
    });

    if (error) {
      console.error('Error al enviar email con Resend:', error);
      return res.status(500).json({ 
        error: 'Error al enviar el email de verificación',
        details: error.message 
      });
    }

    console.log('Email enviado exitosamente:', data);

    return res.status(200).json({ 
      success: true,
      message: 'Código de verificación enviado exitosamente',
      emailId: data?.id,
      fechaExpiracion: fechaExpiracion.toMillis() // Enviar timestamp de expiración
    });

  } catch (error: any) {
    console.error('Error en enviar-codigo-verificacion:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
}

