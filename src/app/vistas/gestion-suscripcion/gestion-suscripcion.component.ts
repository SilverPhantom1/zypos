import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, ToastController } from '@ionic/angular/standalone';
import { arrowBack, checkmarkCircle, closeCircle } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, query, where, doc, getDoc, Timestamp } from '@angular/fire/firestore';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';

@Component({
  selector: 'app-gestion-suscripcion',
  templateUrl: './gestion-suscripcion.component.html',
  styleUrls: ['./gestion-suscripcion.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, CommonModule]
})
export class GestionSuscripcionComponent implements OnInit {
  planes: any[] = [];
  estaCargandoPlanes: boolean = false;
  usuarioId: string | null = null;
  verificandoAuth: boolean = true;
  
  suscripcionActual: any = null;
  diasRestantes: number = 0;

  constructor(
    private firestore: Firestore,
    private auth: Auth,
    private router: Router,
    private toastController: ToastController
  ) {
    addIcons({ arrowBack, checkmarkCircle, closeCircle });
  }

  async ngOnInit() {
    const sesionTrabajador = sessionStorage.getItem('zypos_sesion_trabajador');
    if (sesionTrabajador) {
      this.router.navigate(['/ventas'], { replaceUrl: true });
      return;
    }

    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      } else {
        if (user.uid !== this.usuarioId) {
          this.usuarioId = user.uid;
          this.verificandoAuth = false;
          await Promise.all([
            this.cargarPlanes(),
            this.cargarEstadoSuscripcion()
          ]);
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

  async cargarEstadoSuscripcion() {
    if (!this.usuarioId) return;
    
    try {
      const usuarioDoc = await getDoc(doc(this.firestore, 'usuarios', this.usuarioId));
      
      if (usuarioDoc.exists()) {
        const datosUsuario = usuarioDoc.data();
        
        if (datosUsuario['suscripcion']) {
          this.suscripcionActual = datosUsuario['suscripcion'];
          
          if (this.suscripcionActual.vence) {
            const vence = this.suscripcionActual.vence as Timestamp;
            const fechaVencimiento = vence.toDate();
            const ahora = new Date();
            const diferencia = fechaVencimiento.getTime() - ahora.getTime();
            this.diasRestantes = Math.max(0, Math.ceil(diferencia / (1000 * 60 * 60 * 24)));
            
            if (diferencia < 0) {
              this.suscripcionActual.estado = 'vencida';
            } else {
              this.suscripcionActual.estado = this.suscripcionActual.estado || 'activa';
            }
          }
        }
      }
    } catch (error) {
      console.error('Error al cargar estado de suscripción:', error);
    }
  }

  formatearPrecio(precio: number): string {
    if (precio === 0) {
      return 'Gratis';
    }
    return `$${precio.toLocaleString('es-CL')}`;
  }

  formatearFecha(timestamp: Timestamp): string {
    if (!timestamp) return 'N/A';
    const fecha = timestamp.toDate();
    return fecha.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  obtenerEstadoSuscripcion(): string {
    if (!this.suscripcionActual) return 'Sin suscripción';
    
    if (this.suscripcionActual.estado === 'vencida') {
      return 'Vencida';
    }
    
    if (this.diasRestantes <= 3 && this.diasRestantes > 0) {
      return `Por vencer (${this.diasRestantes} días)`;
    }
    
    return 'Activa';
  }

  async renovarSuscripcion() {
    this.router.navigate(['/planes']);
  }

  volverAtras() {
    this.router.navigate(['/home']);
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
