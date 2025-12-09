import { Component, OnInit } from '@angular/core';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, ToastController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge } from '@ionic/angular/standalone';
import { personCircle, logOut, cube, storefront, timeOutline, checkmarkCircle, mailOutline, callOutline, informationCircleOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc, Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, RouterLink, CommonModule, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge]
})
export class HomeComponent implements OnInit {
  verificandoAuth: boolean = true;
  usuarioId: string | null = null;
  datosUsuario: any = null;
  planActual: string = 'free';
  diasRestantes: number = 0;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
    private toastController: ToastController
  ) {
    addIcons({ personCircle, logOut, cube, storefront, timeOutline, checkmarkCircle, mailOutline, callOutline, informationCircleOutline });
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
          await this.cargarDatosUsuario();
        }
      }
    });
  }

  async cargarDatosUsuario() {
    if (!this.usuarioId) return;
    
    try {
      const usuarioDoc = await getDoc(doc(this.firestore, 'usuarios', this.usuarioId));
      
      if (usuarioDoc.exists()) {
        this.datosUsuario = usuarioDoc.data();
        
        // Cargar información del plan
        if (this.datosUsuario.suscripcion) {
          this.planActual = this.datosUsuario.suscripcion.nombre || 'free';
          if (this.datosUsuario.suscripcion.vence) {
            const vence = this.datosUsuario.suscripcion.vence as Timestamp;
            const fechaVencimiento = vence.toDate();
            const ahora = new Date();
            const diferencia = fechaVencimiento.getTime() - ahora.getTime();
            this.diasRestantes = Math.max(0, Math.ceil(diferencia / (1000 * 60 * 60 * 24)));
          }
        }
      }
    } catch (error) {
      console.error('Error al cargar datos del usuario:', error);
    }
  }

  obtenerNombreUsuario(): string {
    return this.datosUsuario?.nombre || 'Usuario';
  }

  obtenerNombrePlan(): string {
    return this.planActual === 'free' ? 'Gratis' : this.planActual.charAt(0).toUpperCase() + this.planActual.slice(1);
  }

  // Cerrar sesión
  async cerrarSesion() {
    try {
      // Limpiar datos locales primero
      localStorage.clear();
      sessionStorage.clear();
      
      // Cerrar sesión en Firebase
      await signOut(this.auth);
      
      // Redirigir inmediatamente y reemplazar toda la historia del navegador
      // Esto previene que el usuario pueda volver atrás
      this.router.navigate(['/iniciar-sesion'], { replaceUrl: true }).then(() => {
        // Forzar recarga de la página para limpiar completamente el estado
        // Esto asegura que no queden datos en memoria
        window.history.replaceState(null, '', '/iniciar-sesion');
      });
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      this.mostrarToast('Error al cerrar sesión', 'danger');
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
