import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {IonHeader,IonToolbar, IonContent,IonItem,IonLabel,IonInput,IonButton, ToastController,IonIcon} from '@ionic/angular/standalone';
import { checkmarkCircle } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Auth, sendPasswordResetEmail } from '@angular/fire/auth';

@Component({
  selector: 'app-recuperar-contrasena',
  templateUrl: './recuperar-contrasena.component.html',
  styleUrls: ['./recuperar-contrasena.component.scss'],
  standalone: true,
  imports: [IonHeader,IonToolbar, IonContent,IonItem,IonLabel,IonInput,IonButton,IonIcon,ReactiveFormsModule,CommonModule,RouterLink]
})
export class RecuperarContrasenaComponent implements OnInit {
  formularioRecuperacion!: FormGroup;
  estaCargando: boolean = false;
  emailEnviado: boolean = false;
  emailGuardado: string = '';

  constructor(private formBuilder: FormBuilder,private auth: Auth,private router: Router,private toastController: ToastController
  ) {

    addIcons({ checkmarkCircle });
  }

  ngOnInit() {
    this.formularioRecuperacion = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  async enviarFormulario() {
    if (this.formularioRecuperacion.valid) {
      this.estaCargando = true; 
      
      try {
        const { email } = this.formularioRecuperacion.value;
        
        this.emailGuardado = email;
        
        const urlPersonalizada = window.location.origin + '/nueva-contrasena';
        console.log('URL personalizada configurada:', urlPersonalizada);
        
        const actionCodeSettings = {
          url: urlPersonalizada,
          handleCodeInApp: false
        };
        
        await sendPasswordResetEmail(this.auth, email, actionCodeSettings);
        this.emailEnviado = true;
        this.mostrarToast('Se ha enviado un correo de recuperación a tu email', 'success');
        
      } catch (error: any) {
        let mensajeError = 'Error al enviar el email. Por favor, intenta nuevamente.';
        
        if (error.code === 'auth/user-not-found') {
          mensajeError = 'No existe una cuenta con este email.';
        } else if (error.code === 'auth/invalid-email') {
          mensajeError = 'El email no es válido. Por favor, verifica el formato.';
        } else if (error.code === 'auth/network-request-failed') {
          mensajeError = 'Error de conexión. Verifica tu internet e intenta nuevamente.';
        } else if (error.code === 'auth/too-many-requests') {
          mensajeError = 'Demasiados intentos. Intenta más tarde.';
        }
        
        this.mostrarToast(mensajeError, 'danger');
      } finally {
        this.estaCargando = false;
      }
      
    } else {
      Object.keys(this.formularioRecuperacion.controls).forEach(key => {
        this.formularioRecuperacion.get(key)?.markAsTouched();
      });
    }
  }

  async reenviarEmail() {
    if (this.emailGuardado) {
      this.estaCargando = true;
      
      try {
        const urlPersonalizada = window.location.origin + '/nueva-contrasena';
        
        const actionCodeSettings = {
          url: urlPersonalizada,
          handleCodeInApp: false
        };
        
        await sendPasswordResetEmail(this.auth, this.emailGuardado, actionCodeSettings);
        
        this.mostrarToast('Se ha reenviado el correo de recuperación', 'success');
        
      } catch (error: any) {
        let mensajeError = 'Error al reenviar el email. Por favor, intenta nuevamente.';
        
        if (error.code === 'auth/user-not-found') {
          mensajeError = 'No existe una cuenta con este email.';
        } else if (error.code === 'auth/invalid-email') {
          mensajeError = 'El email no es válido. Por favor, verifica el formato.';
        } else if (error.code === 'auth/network-request-failed') {
          mensajeError = 'Error de conexión. Verifica tu internet e intenta nuevamente.';
        } else if (error.code === 'auth/too-many-requests') {
          mensajeError = 'Demasiados intentos. Intenta más tarde.';
        }
        
        this.mostrarToast(mensajeError, 'danger');
      } finally {
        this.estaCargando = false;
      }
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
