import { Component, OnInit } from '@angular/core';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, ToastController } from '@ionic/angular/standalone';
import { personCircle, logOut } from 'ionicons/icons';
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
    addIcons({ personCircle, logOut });
  }

  async ngOnInit() {
    // Verificación síncrona inmediata del estado de autenticación
    const usuarioActual = this.auth.currentUser;
    
    if (!usuarioActual) {
      // Si no hay usuario, redirigir inmediatamente sin esperar
      this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      return;
    }
    
    // Si hay usuario, permitir acceso
    this.verificandoAuth = false;
    
    // Listener para cambios futuros en el estado de autenticación
    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        // Si se cerró sesión, redirigir inmediatamente
        this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
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
