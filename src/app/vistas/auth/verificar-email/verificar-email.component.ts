import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonItem, IonLabel, IonInput, IonButton, ToastController, IonIcon, IonTitle } from '@ionic/angular/standalone';
import { mail, checkmarkCircle, arrowBack, refresh, timeOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, doc, setDoc, serverTimestamp, Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-verificar-email',
  templateUrl: './verificar-email.component.html',
  styleUrls: ['./verificar-email.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonItem, IonLabel, IonInput, IonButton, IonIcon, ReactiveFormsModule, CommonModule]
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
    private toastController: ToastController,
    private auth: Auth,
    private firestore: Firestore
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

    // Actualizar inmediatamente el tiempo restante
    this.actualizarTiempoRestante();

    this.intervaloContador = setInterval(() => {
      this.actualizarTiempoRestante();
    }, 1000); // Actualizar cada segundo
  }

  actualizarTiempoRestante() {
    if (this.fechaExpiracion) {
      const ahora = Date.now();
      const diferencia = this.fechaExpiracion - ahora;

      if (diferencia <= 0) {
        this.tiempoRestante = '00:00';
        if (this.intervaloContador) {
          clearInterval(this.intervaloContador);
          this.intervaloContador = null;
        }
        this.mensajeError = 'El código ha expirado. Solicita uno nuevo.';
      } else {
        const minutos = Math.floor(diferencia / 60000);
        const segundos = Math.floor((diferencia % 60000) / 1000);
        this.tiempoRestante = `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
      }
    }
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
        // Limpiar intervalo anterior si existe
        if (this.intervaloContador) {
          clearInterval(this.intervaloContador);
          this.intervaloContador = null;
        }
        
        this.fechaExpiracion = data.fechaExpiracion;
        sessionStorage.setItem('zypos_codigo_expiracion', data.fechaExpiracion.toString());
        this.mensajeError = ''; // Limpiar mensaje de error si había
        this.iniciarContador(); // Esto actualizará el tiempo inmediatamente
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

      // Si el código es válido, crear la cuenta en Firebase Auth y Firestore
      const datosRegistroStr = sessionStorage.getItem('zypos_datos_registro_pendiente');
      if (datosRegistroStr) {
        try {
          const datosRegistro = JSON.parse(datosRegistroStr);
          
          // Crear cuenta en Firebase Auth
          const credencialUsuario = await createUserWithEmailAndPassword(
            this.auth, 
            datosRegistro.email, 
            datosRegistro.contraseña
          );
          const usuarioId = credencialUsuario.user.uid;
          
          // Crear documento en Firestore
          const fechaActual = new Date();
          const fechaInicio = Timestamp.fromDate(fechaActual);
          const fechaVencimiento = new Date(fechaActual);
          fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
          const fechaVencimientoTimestamp = Timestamp.fromDate(fechaVencimiento);
          
          const fechaCreacion = serverTimestamp();
          
          await setDoc(doc(this.firestore, 'usuarios', usuarioId), {
            nombre: datosRegistro.nombre,
            rut: datosRegistro.rut,
            email: datosRegistro.email,
            creacion: fechaCreacion,
            emailVerificado: true, // Ya está verificado
            fechaVerificacionEmail: Timestamp.now(),
            suscripcion: {
              nombre: 'free',
              vence: fechaVencimientoTimestamp,
              fechaInicio: fechaInicio,
              estado: 'activa'
            },
            planGratuitoUsado: true
          });
          
          // Limpiar datos temporales
          sessionStorage.removeItem('zypos_datos_registro_pendiente');
        } catch (error: any) {
          console.error('Error al crear cuenta después de verificación:', error);
          this.mostrarToast('Código verificado, pero hubo un error al crear la cuenta. Por favor, intenta iniciar sesión.', 'warning');
        }
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

