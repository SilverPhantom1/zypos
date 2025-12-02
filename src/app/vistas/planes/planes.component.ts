import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, ToastController } from '@ionic/angular/standalone';
import { checkmarkCircle, arrowBack } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, query, where, doc, getDoc, Timestamp, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';

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

  constructor(
    private firestore: Firestore,
    private auth: Auth,
    private router: Router,
    private toastController: ToastController
  ) {
    addIcons({ checkmarkCircle, arrowBack });
  }

  async ngOnInit() {
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

  seleccionarPlan(nombrePlan: string) {
    this.planSeleccionado = nombrePlan.toLowerCase();
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

    this.estaProcesando = true;

    try {
      const planElegido = this.planes.find(p => p.nombre.toLowerCase() === this.planSeleccionado);
      
      if (!planElegido) {
        this.mostrarToast('Plan no encontrado', 'danger');
        return;
      }

      const duracionDias = planElegido.duracionDias || 30;
      
      // Calcular fecha de vencimiento
      const fechaActual = new Date();
      const fechaVencimiento = new Date(fechaActual);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + duracionDias);
      const fechaVencimientoTimestamp = Timestamp.fromDate(fechaVencimiento);

      // Obtener datos del usuario
      const usuarioDoc = await getDoc(doc(this.firestore, 'usuarios', this.usuarioId));
      
      if (!usuarioDoc.exists()) {
        this.mostrarToast('Usuario no encontrado', 'danger');
        return;
      }

      // Actualizar suscripción del usuario
      await setDoc(doc(this.firestore, 'usuarios', this.usuarioId), {
        ...usuarioDoc.data(),
        suscripcion: {
          nombre: this.planSeleccionado,
          vence: fechaVencimientoTimestamp
        }
      }, { merge: true });

      this.mostrarToast('Plan activado correctamente', 'success');

      // Redirigir al home
      setTimeout(() => {
        this.router.navigate(['/home'], { replaceUrl: true });
      }, 2000);

    } catch (error: any) {
      console.error('Error al confirmar plan:', error);
      this.mostrarToast('Error al procesar el plan seleccionado', 'danger');
    } finally {
      this.estaProcesando = false;
    }
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
