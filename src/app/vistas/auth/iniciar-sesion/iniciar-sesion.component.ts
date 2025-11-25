import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader,IonToolbar, IonContent,IonItem,IonLabel,IonInput,IonButton, ToastController, IonIcon} from '@ionic/angular/standalone';
import { eye, eyeOff } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Auth, signInWithEmailAndPassword } from '@angular/fire/auth';

@Component({
  selector: 'app-iniciar-sesion',
  templateUrl: './iniciar-sesion.component.html',
  styleUrls: ['./iniciar-sesion.component.scss'],
  standalone: true,
  imports: [ IonHeader,IonToolbar, IonContent,IonItem,IonLabel,IonInput,IonButton,IonIcon,ReactiveFormsModule,CommonModule,RouterLink]
})
export class IniciarSesionComponent implements OnInit {
  // Formulario
  formularioLogin!: FormGroup;
  
  // Estado de carga
  estaCargando: boolean = false;
  
  // Mensaje de error
  mensajeError: string = '';
  
  // Variable para mostrar/ocultar contraseña
  mostrarPassword: boolean = false;

  constructor(
    private formBuilder: FormBuilder,
    private auth: Auth,
    private router: Router,
    private toastController: ToastController
  ) {
    // iconos
    addIcons({ eye, eyeOff });
  }

  ngOnInit() {
    // formulario con validaciones
    this.formularioLogin = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      contraseña: ['', [Validators.required]]
    });
  }

  // Función del formulario
  async enviarFormulario() {
    // Verificar que el formulario sea válido
    if (this.formularioLogin.valid) {
      this.estaCargando = true; // Activar estado de carga
      
      try {
        const { email, contraseña } = this.formularioLogin.value;
        
        // Iniciar sesión en Firebase
        await signInWithEmailAndPassword(this.auth, email, contraseña);
        
        // Redirigir al home después del login
        this.router.navigate(['/home']);
        
      } catch (error: any) {
        console.error('Error al iniciar sesión:', error);
        
        // Mensaje de error según el fallo que pueda haber
        let mensajeError = 'Error al iniciar sesión. Por favor, intenta nuevamente.';
        
        if (error.code === 'auth/user-not-found') {
          mensajeError = 'No existe una cuenta con este email.';
        } else if (error.code === 'auth/wrong-password') {
          mensajeError = 'La contraseña es incorrecta.';
        } else if (error.code === 'auth/invalid-email') {
          mensajeError = 'El email no es válido. Por favor, verifica el formato.';
        } else if (error.code === 'auth/network-request-failed') {
          mensajeError = 'Error de conexión. Verifica tu internet e intenta nuevamente.';
        } else if (error.code === 'auth/too-many-requests') {
          mensajeError = 'Demasiados intentos fallidos. Intenta más tarde.';
        }
        
        this.mensajeError = mensajeError;
        this.mostrarToast(mensajeError, 'danger');
      } finally {
        this.estaCargando = false; // Desactivar estado de carga
      }
      
    } else {

      Object.keys(this.formularioLogin.controls).forEach(key => {
        this.formularioLogin.get(key)?.markAsTouched();
      });
    }
  }

  // Función para mostrar mensajes
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

  // Función para alternar visibilidad de la contraseña
  alternarVisibilidadPassword() {
    this.mostrarPassword = !this.mostrarPassword;
  }
}
