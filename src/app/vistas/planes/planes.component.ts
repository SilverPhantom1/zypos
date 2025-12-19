import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, ToastController, AlertController } from '@ionic/angular/standalone';
import { checkmarkCircle, arrowBack, closeCircle } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, query, where, doc, getDoc, Timestamp, serverTimestamp, setDoc, addDoc } from '@angular/fire/firestore';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { MercadoPagoService } from '../../servicios/mercado-pago.service';

@Component({
  selector: 'app-planes',
  templateUrl: './planes.component.html',
  styleUrls: ['./planes.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, CommonModule]
})
export class PlanesComponent implements OnInit {
  planes: any[] = [];
  planSeleccionado: string = 'free';
  estaCargandoPlanes: boolean = false;
  usuarioId: string | null = null;
  estaProcesando: boolean = false;
  verificandoAuth: boolean = true;
  
  planGratuitoUsado: boolean = false;

  constructor(
    private firestore: Firestore,
    private auth: Auth,
    private router: Router,
    private route: ActivatedRoute,
    private toastController: ToastController,
    private alertController: AlertController,
    private mercadoPagoService: MercadoPagoService
  ) {
    addIcons({ checkmarkCircle, arrowBack, closeCircle });
  }

  async ngOnInit() {
    // Verificar si hay parámetros de retorno de MercadoPago
    this.route.queryParams.subscribe(async params => {
      if (params['payment_status'] && params['user_id'] && params['plan_id']) {
        await this.manejarRetornoPago(params['payment_status'], params['user_id'], params['plan_id']);
      }
    });

    // Esperar a que Firebase Auth se inicialice completamente (importante después de refresh)
    // onAuthStateChanged se ejecuta cuando Firebase Auth termina de inicializarse
    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        // Si no hay usuario después de la inicialización, redirigir
        this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      } else {
        // Si hay usuario, cargar datos
        if (user.uid !== this.usuarioId) {
          this.usuarioId = user.uid;
          this.verificandoAuth = false;
          await this.cargarPlanes();
          await this.verificarPlanGratuitoUsado();
        }
      }
    });
  }

  async cargarPlanes() {
    this.estaCargandoPlanes = true;
    try {
      const planesRef = collection(this.firestore, 'planes');
      const q = query(planesRef, where('activo', '==', true));
      const querySnapshot = await getDocs(q);
      
      this.planes = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a: any, b: any) => {
        // Ordenar: Free primero, luego Plus
        if (a.nombre.toLowerCase() === 'free') return -1;
        if (b.nombre.toLowerCase() === 'free') return 1;
        return 0;
      });
    } catch (error) {
      console.error('Error al cargar planes:', error);
      this.mostrarToast('Error al cargar los planes disponibles', 'danger');
    } finally {
      this.estaCargandoPlanes = false;
    }
  }

  async verificarPlanGratuitoUsado() {
    if (!this.usuarioId) return;
    
    try {
      const usuarioDoc = await getDoc(doc(this.firestore, 'usuarios', this.usuarioId));
      
      if (usuarioDoc.exists()) {
        const datosUsuario = usuarioDoc.data();
        // Verificar si ya usó el plan gratuito
        this.planGratuitoUsado = datosUsuario['planGratuitoUsado'] || false;
      }
    } catch (error) {
      console.error('Error al verificar plan gratuito:', error);
    }
  }

  seleccionarPlan(nombrePlan: string) {
    const nombrePlanLower = nombrePlan.toLowerCase();
    
    // Validar si intenta seleccionar plan gratuito y ya lo usó
    if (nombrePlanLower === 'free' && this.planGratuitoUsado) {
      this.mostrarToast('El plan gratuito solo puede utilizarse una vez. Por favor, selecciona el plan Plus.', 'warning');
      return;
    }
    
    this.planSeleccionado = nombrePlanLower;
  }

  formatearPrecio(precio: number): string {
    if (precio === 0) {
      return 'Gratis';
    }
    // Formatear precio en pesos chilenos con separador de miles
    return `$${precio.toLocaleString('es-CL')}`;
  }

  async confirmarPlan() {
    if (!this.usuarioId) {
      this.mostrarToast('Debes estar autenticado para seleccionar un plan', 'warning');
      this.router.navigate(['/iniciar-sesion']);
      return;
    }

    // Validar plan gratuito
    if (this.planSeleccionado === 'free' && this.planGratuitoUsado) {
      this.mostrarToast('El plan gratuito solo puede utilizarse una vez. Por favor, selecciona el plan Plus.', 'warning');
      return;
    }

    this.estaProcesando = true;

    try {
      const planElegido = this.planes.find(p => p.nombre.toLowerCase() === this.planSeleccionado);
      
      if (!planElegido) {
        this.mostrarToast('Plan no encontrado', 'danger');
        return;
      }

      // Si es plan Plus, procesar pago con MercadoPago
      if (planElegido.precio > 0) {
        this.estaProcesando = false; // Liberar el estado mientras se procesa el pago
        
        // Mostrar confirmación antes de proceder con el pago
        const confirmado = await this.mostrarConfirmacionPago(planElegido);
        if (!confirmado) {
          return; // El usuario canceló
        }

        // Procesar pago con MercadoPago
        try {
          this.estaProcesando = true; // Volver a activar el estado de procesamiento
          await this.procesarPagoMercadoPago(planElegido);
          return; // La redirección se hace en procesarPagoMercadoPago
        } catch (error: any) {
          console.error('Error al procesar pago:', error);
          this.estaProcesando = false;
          
          // Mostrar mensaje de error más detallado
          let mensajeError = 'Error al procesar el pago. Por favor, intenta nuevamente.';
          if (error.message?.includes('Error al crear preferencia')) {
            mensajeError = 'Error al conectar con el sistema de pagos. Por favor, intenta nuevamente.';
          }
          
          this.mostrarToast(mensajeError, 'danger');
          return;
        }
      }

      // Si es plan gratuito, activar directamente
      await this.activarPlan(planElegido, false);

    } catch (error: any) {
      console.error('Error al confirmar plan:', error);
      this.mostrarToast('Error al procesar el plan seleccionado', 'danger');
    } finally {
      this.estaProcesando = false;
    }
  }

  async mostrarConfirmacionPago(plan: any): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertController.create({
        header: 'Confirmar Pago',
        message: `¿Deseas proceder con el pago de ${this.formatearPrecio(plan.precio)} por el plan ${plan.nombre}?`,
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            handler: () => resolve(false)
          },
          {
            text: 'Continuar con el Pago',
            handler: () => resolve(true)
          }
        ]
      });
      await alert.present();
    });
  }

  async procesarPagoMercadoPago(plan: any) {
    if (!this.usuarioId) {
      throw new Error('Usuario no autenticado');
    }

    try {
      const planId = plan.id || plan.nombre;
      const descripcion = `Plan ${plan.nombre} - ${plan.descripcion}`;
      
      // Procesar pago con Checkout Pro usando Vercel
      await this.mercadoPagoService.procesarPagoPlan(
        plan.precio,
        descripcion,
        this.usuarioId,
        planId
      );
    } catch (error: any) {
      console.error('Error al procesar pago:', error);
      throw error;
    }
  }

  /**
   * Maneja el retorno de un pago (Checkout Pro)
   */
  async manejarRetornoPago(paymentStatus: string, userId: string, planId: string) {
    if (!this.usuarioId || this.usuarioId !== userId) {
      return;
    }

    // Limpiar parámetros de la URL
    this.router.navigate(['/planes'], { replaceUrl: true, queryParams: {} });

    if (paymentStatus === 'approved') {
      // Pago aprobado, activar el plan
      const planElegido = this.planes.find(p => (p.id === planId || p.nombre.toLowerCase() === planId.toLowerCase()));
      
      if (planElegido) {
        this.planSeleccionado = planElegido.nombre.toLowerCase();
        await this.activarPlan(planElegido, true); // true indica que el pago ya fue procesado
        this.mostrarToast('¡Pago aprobado! Plan activado correctamente.', 'success');
      } else {
        this.mostrarToast('Plan no encontrado', 'danger');
      }
    } else if (paymentStatus === 'pending') {
      this.mostrarToast('Tu pago está pendiente. Te notificaremos cuando sea aprobado.', 'warning');
    } else if (paymentStatus === 'failure') {
      this.mostrarToast('El pago no pudo ser procesado. Por favor, intenta nuevamente.', 'danger');
    }
  }

  async activarPlan(planElegido: any, pagoProcesado: boolean = false) {
    if (!this.usuarioId) return;

    this.estaProcesando = true;

    try {
      const duracionDias = planElegido.duracionDias || 30;
      
      // Calcular fechas
      const fechaActual = new Date();
      const fechaInicio = Timestamp.fromDate(fechaActual);
      const fechaVencimiento = new Date(fechaActual);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + duracionDias);
      const fechaVencimientoTimestamp = Timestamp.fromDate(fechaVencimiento);

      // Obtener datos del usuario
      const usuarioDoc = await getDoc(doc(this.firestore, 'usuarios', this.usuarioId));
      
      if (!usuarioDoc.exists()) {
        this.mostrarToast('Usuario no encontrado', 'danger');
        return;
      }

      const datosUsuario = usuarioDoc.data();
      
      // Preparar datos de suscripción para el usuario
      const suscripcionUsuario = {
        nombre: this.planSeleccionado,
        vence: fechaVencimientoTimestamp,
        fechaInicio: fechaInicio,
        estado: 'activa'
      };

      // Actualizar suscripción del usuario (mantener compatibilidad)
      const actualizacionUsuario: any = {
        suscripcion: suscripcionUsuario
      };

      // Si es plan gratuito, marcar como usado
      if (this.planSeleccionado === 'free') {
        actualizacionUsuario.planGratuitoUsado = true;
      }

      await setDoc(doc(this.firestore, 'usuarios', this.usuarioId), {
        ...datosUsuario,
        ...actualizacionUsuario
      }, { merge: true });

      // Crear documento en colección suscripciones (nuevo)
      const suscripcionData = {
        userId: this.usuarioId,
        plan: this.planSeleccionado,
        fechaInicio: fechaInicio,
        fechaVencimiento: fechaVencimientoTimestamp,
        estado: 'activa',
        detallesPago: planElegido.precio > 0 ? {
          metodo: 'mercadoPago',
          monto: planElegido.precio,
          procesado: pagoProcesado
        } : null,
        creado: serverTimestamp()
      };

      await addDoc(collection(this.firestore, 'suscripciones'), suscripcionData);

      this.mostrarToast('Plan activado correctamente', 'success');

      // Actualizar estado local
      if (this.planSeleccionado === 'free') {
        this.planGratuitoUsado = true;
      }

      // Redirigir al home después de un breve delay
      setTimeout(() => {
        this.router.navigate(['/home'], { replaceUrl: true });
      }, 2000);

    } catch (error: any) {
      console.error('Error al activar plan:', error);
      this.mostrarToast('Error al activar el plan', 'danger');
    } finally {
      this.estaProcesando = false;
    }
  }

  verDespues() {
    // El usuario ya tiene el plan gratuito asignado por defecto al registrarse
    // Redirigir directamente al home
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  async mostrarToast(mensaje: string, color: string = 'danger') {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 4000,
      position: 'top',
      color: color,
      buttons: [
        {
          text: 'Cerrar',
          role: 'cancel'
        }
      ]
    });
    await toast.present();
  }
}
