import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonItem, IonLabel, IonInput, IonButton, ToastController, IonIcon, IonTitle } from '@ionic/angular/standalone';
import { mail, checkmarkCircle, arrowBack, refresh, timeOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-verificar-email',
  templateUrl: './verificar-email.component.html',
  styleUrls: ['./verificar-email.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonItem, IonLabel, IonInput, IonButton, IonIcon, ReactiveFormsModule, CommonModule]
})
export class VerificarEmailComponent implements OnInit, OnDestroy {
  formularioVerificacion!: FormGroup;
  estaCargando: boolean = false;
  estaEnviandoCodigo: boolean = false;
  email: string = '';
  mensajeError: string = '';
  codigoVerificado: boolean = false;
  tiempoRestante: string = '02:00';
  fechaExpiracion: number | null = null;
  private intervaloContador: any = null;

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private toastController: ToastController
  ) {
    addIcons({ mail, checkmarkCircle, arrowBack, refresh, timeOutline });
  }

  ngOnInit() {
    // Obtener email de los query params
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
    });

    this.formularioVerificacion = this.formBuilder.group({
      codigo: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
    });

    // Intentar obtener fecha de expiración de sessionStorage
    const fechaExpiracionGuardada = sessionStorage.getItem('zypos_codigo_expiracion');
    if (fechaExpiracionGuardada) {
      this.fechaExpiracion = parseInt(fechaExpiracionGuardada);
      this.iniciarContador();
    } else {
      // Si no hay fecha guardada, enviar código automáticamente
      this.enviarCodigo();
    }
  }

  ngOnDestroy() {
    if (this.intervaloContador) {
      clearInterval(this.intervaloContador);
    }
  }

  iniciarContador() {
    if (this.intervaloContador) {
      clearInterval(this.intervaloContador);
    }

    this.intervaloContador = setInterval(() => {
      if (this.fechaExpiracion) {
        const ahora = Date.now();
        const diferencia = this.fechaExpiracion - ahora;

        if (diferencia <= 0) {
          this.tiempoRestante = '00:00';
          clearInterval(this.intervaloContador);
          this.mensajeError = 'El código ha expirado. Solicita uno nuevo.';
        } else {
          const minutos = Math.floor(diferencia / 60000);
          const segundos = Math.floor((diferencia % 60000) / 1000);
          this.tiempoRestante = `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
        }
      }
    }, 1000); // Actualizar cada segundo
  }

  async enviarCodigo() {
    if (!this.email) {
      this.mostrarToast('No se encontró el email. Por favor, regístrate nuevamente.', 'danger');
      this.router.navigate(['/registrarse']);
      return;
    }

    this.estaEnviandoCodigo = true;

    try {
      const response = await fetch(`${environment.vercelUrl}/api/enviar-codigo-verificacion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: this.email,
          nombre: 'Usuario' // Podrías obtener el nombre del usuario si lo guardas en sessionStorage
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al enviar el código');
      }

      // Guardar fecha de expiración
      if (data.fechaExpiracion) {
        this.fechaExpiracion = data.fechaExpiracion;
        sessionStorage.setItem('zypos_codigo_expiracion', data.fechaExpiracion.toString());
        this.mensajeError = ''; // Limpiar mensaje de error si había
        this.iniciarContador();
      }

      this.mostrarToast('Código de verificación enviado a tu email', 'success');
    } catch (error: any) {
      console.error('Error al enviar código:', error);
      this.mostrarToast(error.message || 'Error al enviar el código. Intenta nuevamente.', 'danger');
    } finally {
      this.estaEnviandoCodigo = false;
    }
  }

  async verificarCodigo() {
    if (this.formularioVerificacion.invalid) {
      Object.keys(this.formularioVerificacion.controls).forEach(key => {
        this.formularioVerificacion.get(key)?.markAsTouched();
      });
      return;
    }

    if (!this.email) {
      this.mostrarToast('No se encontró el email. Por favor, regístrate nuevamente.', 'danger');
      this.router.navigate(['/registrarse']);
      return;
    }

    this.estaCargando = true;
    this.mensajeError = '';

    try {
      const { codigo } = this.formularioVerificacion.value;

      const response = await fetch(`${environment.vercelUrl}/api/verificar-codigo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: this.email,
          codigo: codigo
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al verificar el código');
      }

      this.codigoVerificado = true;
      
      // Limpiar contador y sessionStorage
      if (this.intervaloContador) {
        clearInterval(this.intervaloContador);
      }
      sessionStorage.removeItem('zypos_codigo_expiracion');
      
      this.mostrarToast('Email verificado exitosamente', 'success');

      // Redirigir a planes después de 2 segundos
      setTimeout(() => {
        this.router.navigate(['/planes'], { replaceUrl: true });
      }, 2000);

    } catch (error: any) {
      console.error('Error al verificar código:', error);
      this.mensajeError = error.message || 'Código inválido. Verifica e intenta nuevamente.';
      this.mostrarToast(this.mensajeError, 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  async mostrarToast(mensaje: string, color: string = 'danger') {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 4000,
      position: 'top',
      color: color
    });
    await toast.present();
  }

  volverAtras() {
    this.router.navigate(['/registrarse']);
  }
}

