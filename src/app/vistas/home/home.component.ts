import { Component, OnInit } from '@angular/core';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, ToastController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge } from '@ionic/angular/standalone';
import { personCircle, logOut, cube, storefront, timeOutline, checkmarkCircle, mailOutline, callOutline, informationCircleOutline, cart, receipt, barChart, peopleOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc, Timestamp, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from '@angular/fire/firestore';

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
    addIcons({ personCircle, logOut, cube, storefront, timeOutline, checkmarkCircle, mailOutline, callOutline, informationCircleOutline, cart, receipt, barChart, peopleOutline });
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
        
        if (this.datosUsuario.suscripcion) {
          this.planActual = this.datosUsuario.suscripcion.nombre || 'free';
          if (this.datosUsuario.suscripcion.vence) {
            const vence = this.datosUsuario.suscripcion.vence as Timestamp;
            const fechaVencimiento = vence.toDate();
            const ahora = new Date();
            const diferencia = fechaVencimiento.getTime() - ahora.getTime();
            this.diasRestantes = Math.max(0, Math.ceil(diferencia / (1000 * 60 * 60 * 24)));
            
            if (diferencia < 0 && this.planActual === 'plus') {
              await this.degradarSuscripcionVencida();
            }
          }
        }
      }
    } catch (error) {
      console.error('Error al cargar datos del usuario:', error);
    }
  }

  async degradarSuscripcionVencida() {
    if (!this.usuarioId) return;
    
    try {
      await setDoc(doc(this.firestore, 'usuarios', this.usuarioId), {
        suscripcion: {
          nombre: 'free',
          estado: 'vencida',
          fechaDegradacion: Timestamp.now()
        }
      }, { merge: true });

      try {
        const suscripcionesRef = collection(this.firestore, 'suscripciones');
        const q = query(
          suscripcionesRef,
          where('userId', '==', this.usuarioId),
          where('estado', '==', 'activa'),
          orderBy('fechaVencimiento', 'desc'),
          limit(1)
        );
        
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const suscripcionDoc = querySnapshot.docs[0];
          await updateDoc(suscripcionDoc.ref, {
            estado: 'vencida',
            fechaDegradacion: Timestamp.now()
          });
        }
      } catch (error) {
        console.warn('No se pudo actualizar la colección suscripciones:', error);
      }

      this.planActual = 'free';
      this.diasRestantes = 0;
      
      this.mostrarToast('Tu suscripción Plus ha vencido. Has sido degradado al plan Free. Solo puedes acceder a tu perfil.', 'warning');
      
    } catch (error) {
      console.error('Error al degradar suscripción:', error);
    }
  }

  obtenerNombreUsuario(): string {
    return this.datosUsuario?.nombre || 'Usuario';
  }

  obtenerNombrePlan(): string {
    return this.planActual === 'free' ? 'Gratis' : this.planActual.charAt(0).toUpperCase() + this.planActual.slice(1);
  }

  async cerrarSesion() {
    try {
      localStorage.clear();
      sessionStorage.clear();
      await signOut(this.auth);
      this.router.navigate(['/iniciar-sesion'], { replaceUrl: true }).then(() => {
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
