import { Component, OnInit } from '@angular/core';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, ToastController } from '@ionic/angular/standalone';
import { personCircle, logOut, cube } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged, signOut } from '@angular/fire/auth';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, RouterLink, CommonModule]
})
export class HomeComponent implements OnInit {
  verificandoAuth: boolean = true;

  constructor(
    private auth: Auth,
    private router: Router,
    private toastController: ToastController
  ) {
    addIcons({ personCircle, logOut, cube });
  }

  async ngOnInit() {
    // Esperar a que Firebase Auth se inicialice completamente (importante después de refresh)
    // onAuthStateChanged se ejecuta cuando Firebase Auth termina de inicializarse
    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        // Si no hay usuario después de la inicialización, redirigir
        this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      } else {
        // Si hay usuario, permitir acceso
        this.verificandoAuth = false;
      }
    });
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
