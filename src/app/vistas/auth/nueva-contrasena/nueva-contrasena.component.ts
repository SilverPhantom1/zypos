import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonItem, IonLabel, IonInput, IonButton, ToastController, IonIcon } from '@ionic/angular/standalone';
import { eye, eyeOff, checkmarkCircle } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Auth, confirmPasswordReset, verifyPasswordResetCode } from '@angular/fire/auth';

@Component({
  selector: 'app-nueva-contrasena',
  templateUrl: './nueva-contrasena.component.html',
  styleUrls: ['./nueva-contrasena.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonItem, IonLabel, IonInput, IonButton, IonIcon, ReactiveFormsModule, CommonModule, RouterLink]
})
export class NuevaContrasenaComponent implements OnInit {
  formularioNuevaContrasena!: FormGroup;
  estaCargando: boolean = false;
  contrasenaCambiada: boolean = false;
  codigoOOB: string = '';
  mostrarContrasena: boolean = false;
  mostrarConfirmarContrasena: boolean = false;
  tokenValido: boolean = false;
  tokenVerificado: boolean = false;

  constructor(private formBuilder: FormBuilder,private auth: Auth,private router: Router,private route: ActivatedRoute,private toastController: ToastController
  ) {
    addIcons({ eye, eyeOff, checkmarkCircle });
  }

  async ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      this.codigoOOB = params['oobCode'] || params['code'] || '';
      
      if (!this.codigoOOB) {
        const urlCompleta = window.location.href;
        const match = urlCompleta.match(/[?&]oobCode=([^&]+)/);
        if (match) {
          this.codigoOOB = decodeURIComponent(match[1]);
        }
      }
      
      if (!this.codigoOOB) {
        this.mostrarToast('El enlace de recuperación no es válido', 'danger');
        setTimeout(() => {
          this.router.navigate(['/recuperar-contrasena']);
        }, 2000);
      } else {
        // Verificar si el token es válido al cargar la página
        await this.verificarToken();
      }
    });

    this.formularioNuevaContrasena = this.formBuilder.group({
      nuevaContrasena: ['', [Validators.required, Validators.minLength(6), this.validarContraseñaSegura]],
      confirmarContrasena: ['', [Validators.required]]
    }, {
      validators: this.validarContraseñasCoinciden
    });
  }

  async verificarToken() {
    if (!this.codigoOOB) {
      return;
    }

    this.estaCargando = true;
    
    try {
      // Verificar si el token es válido y no ha expirado
      await verifyPasswordResetCode(this.auth, this.codigoOOB);
      this.tokenValido = true;
      this.tokenVerificado = true;
    } catch (error: any) {
      this.tokenValido = false;
      this.tokenVerificado = true;
      
      let mensajeError = 'El enlace de recuperación no es válido.';
      
      if (error.code === 'auth/expired-action-code') {
        mensajeError = 'El enlace de recuperación ha expirado. Los enlaces de recuperación expiran después de 1 hora. Solicita uno nuevo.';
      } else if (error.code === 'auth/invalid-action-code') {
        mensajeError = 'El enlace de recuperación no es válido. Solicita uno nuevo.';
      }
      
      this.mostrarToast(mensajeError, 'danger');
      
      setTimeout(() => {
        this.router.navigate(['/recuperar-contrasena']);
      }, 7000);
    } finally {
      this.estaCargando = false;
    }
  }

  // Validador personalizado para contraseña segura
  validarContraseñaSegura(control: any) {
    const valor = control.value;
    if (!valor) {
      return null; // Si está vacío, el validador required se encargará
    }
    
    const errores: any = {};
    
    // Verificar si tiene al menos una mayúscula
    if (!/[A-Z]/.test(valor)) {
      errores.sinMayuscula = true;
    }
    
    // Verificar si tiene al menos un número
    if (!/[0-9]/.test(valor)) {
      errores.sinNumero = true;
    }
    
    // Verificar si tiene al menos un carácter especial
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(valor)) {
      errores.sinCaracterEspecial = true;
    }
    
    // Si hay errores, retornarlos
    if (Object.keys(errores).length > 0) {
      return errores;
    }
    
    return null; // Válido
  }

  validarContraseñasCoinciden(formGroup: FormGroup) {
    const nuevaContrasena = formGroup.get('nuevaContrasena')?.value;
    const confirmarContrasena = formGroup.get('confirmarContrasena')?.value;
    
    if (nuevaContrasena && confirmarContrasena && nuevaContrasena !== confirmarContrasena) {
      formGroup.get('confirmarContrasena')?.setErrors({ noCoinciden: true });
      return { noCoinciden: true };
    }
    return null;
  }

  async enviarFormulario() {
    if (this.formularioNuevaContrasena.valid && this.codigoOOB && this.tokenValido) {
      this.estaCargando = true;
      
      try {
        const { nuevaContrasena } = this.formularioNuevaContrasena.value;
        
        await confirmPasswordReset(this.auth, this.codigoOOB, nuevaContrasena);
        
        this.contrasenaCambiada = true;
        
        this.mostrarToast('Tu contraseña ha sido restablecida exitosamente', 'success');
        
        setTimeout(() => {
          this.router.navigate(['/iniciar-sesion']);
        }, 3000);
        
      } catch (error: any) {
        let mensajeError = 'Error al restablecer la contraseña. Por favor, intenta nuevamente.';
        
        if (error.code === 'auth/expired-action-code') {
          mensajeError = 'El enlace de recuperación ha expirado. Los enlaces de recuperación expiran después de 1 hora. Solicita uno nuevo.';
        } else if (error.code === 'auth/invalid-action-code') {
          mensajeError = 'El enlace de recuperación no es válido. Solicita uno nuevo.';
        } else if (error.code === 'auth/weak-password') {
          mensajeError = 'La contraseña es muy débil. Usa una contraseña más segura.';
        } else if (error.code === 'auth/network-request-failed') {
          mensajeError = 'Error de conexión. Verifica tu internet e intenta nuevamente.';
        }
        
        this.mostrarToast(mensajeError, 'danger');
      } finally {
        this.estaCargando = false;
      }
      
    } else if (!this.tokenValido && this.tokenVerificado) {
      this.mostrarToast('El enlace de recuperación no es válido o ha expirado. Solicita uno nuevo.', 'danger');
    } else {
      Object.keys(this.formularioNuevaContrasena.controls).forEach(key => {
        this.formularioNuevaContrasena.get(key)?.markAsTouched();
      });
    }
  }

  alternarVisibilidadContrasena() {
    this.mostrarContrasena = !this.mostrarContrasena;
  }

  alternarVisibilidadConfirmarContrasena() {
    this.mostrarConfirmarContrasena = !this.mostrarConfirmarContrasena;
  }

  async mostrarToast(mensaje: string, color: string = 'danger') {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 7000,
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
