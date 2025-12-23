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
    const sesionTrabajador = sessionStorage.getItem('zypos_sesion_trabajador');
    if (sesionTrabajador) {
      this.router.navigate(['/ventas'], { replaceUrl: true });
      return;
    }

    this.route.queryParams.subscribe(async params => {
      if (params['payment_status'] && params['user_id'] && params['plan_id']) {
        await this.manejarRetornoPago(params['payment_status'], params['user_id'], params['plan_id']);
      }
    });

    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      } else {
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
        this.planGratuitoUsado = datosUsuario['planGratuitoUsado'] || false;
      }
    } catch (error) {
      console.error('Error al verificar plan gratuito:', error);
    }
  }

  seleccionarPlan(nombrePlan: string) {
    const nombrePlanLower = nombrePlan.toLowerCase();
    
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
    return `$${precio.toLocaleString('es-CL')}`;
  }

  async confirmarPlan() {
    if (!this.usuarioId) {
      this.mostrarToast('Debes estar autenticado para seleccionar un plan', 'warning');
      this.router.navigate(['/iniciar-sesion']);
      return;
    }

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

      if (planElegido.precio > 0) {
        this.estaProcesando = false;
        
        const confirmado = await this.mostrarConfirmacionPago(planElegido);
        if (!confirmado) {
          return;
        }

        try {
          this.estaProcesando = true;
          await this.procesarPagoMercadoPago(planElegido);
          return;
        } catch (error: any) {
          console.error('Error al procesar pago:', error);
          this.estaProcesando = false;
          
          let mensajeError = 'Error al procesar el pago. Por favor, intenta nuevamente.';
          if (error.message?.includes('Error al crear preferencia')) {
            mensajeError = 'Error al conectar con el sistema de pagos. Por favor, intenta nuevamente.';
          }
          
          this.mostrarToast(mensajeError, 'danger');
          return;
        }
      }

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

  async manejarRetornoPago(paymentStatus: string, userId: string, planId: string) {
    if (!this.usuarioId || this.usuarioId !== userId) {
      return;
    }

    this.router.navigate(['/planes'], { replaceUrl: true, queryParams: {} });

    if (paymentStatus === 'approved') {
      const planElegido = this.planes.find(p => (p.id === planId || p.nombre.toLowerCase() === planId.toLowerCase()));
      
      if (planElegido) {
        this.planSeleccionado = planElegido.nombre.toLowerCase();
        await this.activarPlan(planElegido, true);
        this.mostrarToast('¡Pago aprobado! Plan activado correctamente.', 'success');
      } else {
        this.mostrarToast('Plan no encontrado', 'danger');
      }
    } else if (paymentStatus === 'pending') {
      this.mostrarToast('Tu pago está pendiente. Te notificaremos cuando sea aprobado.', 'warning');
    } else if (paymentStatus === 'failure' || paymentStatus === 'rejected') {
      this.mostrarToast('El pago fue rechazado. Por favor, verifica tu tarjeta o intenta con otro método de pago.', 'danger');
    } else {
      this.mostrarToast('Estado de pago desconocido. Por favor, verifica tu suscripción.', 'warning');
    }
  }

  async activarPlan(planElegido: any, pagoProcesado: boolean = false) {
    if (!this.usuarioId) return;

    this.estaProcesando = true;

    try {
      const duracionDias = planElegido.duracionDias || 30;
      
      const fechaActual = new Date();
      const fechaInicio = Timestamp.fromDate(fechaActual);
      const fechaVencimiento = new Date(fechaActual);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + duracionDias);
      const fechaVencimientoTimestamp = Timestamp.fromDate(fechaVencimiento);

      const usuarioDoc = await getDoc(doc(this.firestore, 'usuarios', this.usuarioId));
      
      if (!usuarioDoc.exists()) {
        this.mostrarToast('Usuario no encontrado', 'danger');
        return;
      }

      const datosUsuario = usuarioDoc.data();
      
      const suscripcionUsuario = {
        nombre: this.planSeleccionado,
        vence: fechaVencimientoTimestamp,
        fechaInicio: fechaInicio,
        estado: 'activa'
      };

      const actualizacionUsuario: any = {
        suscripcion: suscripcionUsuario
      };

      if (this.planSeleccionado === 'free') {
        actualizacionUsuario.planGratuitoUsado = true;
      }

      await setDoc(doc(this.firestore, 'usuarios', this.usuarioId), {
        ...datosUsuario,
        ...actualizacionUsuario
      }, { merge: true });

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

      if (this.planSeleccionado === 'free') {
        this.planGratuitoUsado = true;
      }

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
