import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader,IonToolbar, IonContent,IonItem,IonLabel,IonInput,IonButton, ToastController, IonIcon} from '@ionic/angular/standalone';
import { eye, eyeOff } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Auth, createUserWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { Firestore, doc, setDoc, serverTimestamp, Timestamp, collection, query, where, getDocs } from '@angular/fire/firestore';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-registrarse',
  templateUrl: './registrarse.component.html',
  styleUrls: ['./registrarse.component.scss'],
  standalone: true,
  imports: [IonHeader,IonToolbar, IonContent,IonItem,IonLabel,IonInput,IonButton,IonIcon,ReactiveFormsModule,CommonModule,RouterLink]
})
export class RegistrarseComponent implements OnInit {
  formularioRegistro!: FormGroup;
  estaCargando: boolean = false;
  mensajeError: string = '';
  mostrarContrasena: boolean = false;
  mostrarConfirmarContrasena: boolean = false;

  constructor(private formBuilder: FormBuilder,private auth: Auth, private firestore: Firestore,private router: Router,private toastController: ToastController) {
    addIcons({ eye, eyeOff });
  }

  ngOnInit() {
    this.formularioRegistro = this.formBuilder.group({
      nombre: ['', [Validators.required, this.validarSoloLetras]],
      rut: ['', [Validators.required, this.validarRut.bind(this)]],
      email: ['', [Validators.required, Validators.email]],
      contraseña: ['', [Validators.required, Validators.minLength(6), this.validarContraseñaSegura]],
      confirmarContraseña: ['', [Validators.required]]
    }, {
      validators: this.validarContraseñasCoinciden
    });

    // Verificar si hay un registro pendiente y si el código ya expiró
    this.verificarYLimpiarRegistroExpirado();
  }

  verificarYLimpiarRegistroExpirado() {
    const fechaExpiracionStr = sessionStorage.getItem('zypos_codigo_expiracion');
    if (fechaExpiracionStr) {
      const fechaExpiracion = parseInt(fechaExpiracionStr);
      const ahora = Date.now();
      
      // Si el código ya expiró, limpiar los datos
      if (ahora >= fechaExpiracion) {
        sessionStorage.removeItem('zypos_datos_registro_pendiente');
        sessionStorage.removeItem('zypos_codigo_expiracion');
      }
    }
  }

 
  limpiarRut(rut: string): string {
    return rut.replace(/[^0-9kK]/g, '').toUpperCase();
  }

  formatearRut(rut: string): string {
    const rutLimpio = this.limpiarRut(rut);
    if (rutLimpio.length < 2) return rutLimpio;
    const cuerpo = rutLimpio.slice(0, -1);
    const dv = rutLimpio.slice(-1);
    const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${cuerpoFormateado}-${dv}`;
  }

  validarRut(control: any) {
    const valor = control.value;
    if (!valor || !valor.trim()) {
      return null;
    }
    const rutLimpio = this.limpiarRut(valor);
    if (rutLimpio.length < 8 || rutLimpio.length > 9) {
      return { rutInvalido: true };
    }
    const cuerpo = rutLimpio.slice(0, -1);
    const dv = rutLimpio.slice(-1);
    if (!/^\d+$/.test(cuerpo)) {
      return { rutInvalido: true };
    }
    let suma = 0;
    let multiplicador = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += parseInt(cuerpo.charAt(i)) * multiplicador;
      multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
    }
    const resto = suma % 11;
    let dvCalculado: number | string = 11 - resto;
    if (dvCalculado === 11) {
      dvCalculado = 0;
    } else if (dvCalculado === 10) {
      dvCalculado = 'K';
    }
    if (String(dvCalculado) !== dv.toUpperCase()) {
      return { rutInvalido: true };
    }
    return null;
  }

  formatearRutInput(event: any) {
    const valor = event.detail.value || '';
    const rutFormateado = this.formatearRut(valor);
    this.formularioRegistro.patchValue({ rut: rutFormateado }, { emitEvent: false });
  }
 
  validarSoloLetras(control: any) {
    const valor = control.value;
    if (!valor) {
      return null;
    }

    const soloLetrasRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    if (soloLetrasRegex.test(valor)) {
      return null;
    }
    return { soloLetras: true };
  }

  validarContraseñaSegura(control: any) {
    const valor = control.value;
    if (!valor) {
      return null;
    }
    
    const errores: any = {};
    
    if (!/[A-Z]/.test(valor)) {
      errores.sinMayuscula = true;
    }
    
    if (!/[0-9]/.test(valor)) {
      errores.sinNumero = true;
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(valor)) {
      errores.sinCaracterEspecial = true;
    }
    
    if (Object.keys(errores).length > 0) {
      return errores;
    }
    
    return null;
  }

  validarContraseñasCoinciden(formGroup: FormGroup) {
    const contraseña = formGroup.get('contraseña')?.value;
    const confirmarContraseña = formGroup.get('confirmarContraseña')?.value;
    
    if (contraseña !== confirmarContraseña) {
      formGroup.get('confirmarContraseña')?.setErrors({ contraseñasNoCoinciden: true });
      return { contraseñasNoCoinciden: true };
    }
    return null;
  }

  async enviarFormulario() {
    if (this.formularioRegistro.valid) {
      this.estaCargando = true;
      
      try {
        const { nombre, rut, email, contraseña } = this.formularioRegistro.value;
        const rutLimpio = this.limpiarRut(rut);
        const emailNormalizado = email.toLowerCase().trim();
        
        // Verificar si el email ya existe en Firestore
        const usuariosRef = collection(this.firestore, 'usuarios');
        const qEmail = query(usuariosRef, where('email', '==', emailNormalizado));
        const usuarioSnapshotEmail = await getDocs(qEmail);
        
        if (!usuarioSnapshotEmail.empty) {
          this.mostrarToast('Este email ya está registrado. Por favor, usa otro email o inicia sesión.', 'danger');
          this.estaCargando = false;
          return;
        }
        
        // Verificar si el RUT ya existe en Firestore
        const qRut = query(usuariosRef, where('rut', '==', rutLimpio));
        const usuarioSnapshotRut = await getDocs(qRut);
        
        if (!usuarioSnapshotRut.empty) {
          this.mostrarToast('Este RUT ya está registrado. Por favor, usa otro RUT o inicia sesión.', 'danger');
          this.estaCargando = false;
          return;
        }
        
        // También verificar si hay un registro pendiente con este email o RUT
        // Primero verificar si el código anterior ya expiró
        this.verificarYLimpiarRegistroExpirado();
        
        const registroPendiente = sessionStorage.getItem('zypos_datos_registro_pendiente');
        if (registroPendiente) {
          try {
            const datos = JSON.parse(registroPendiente);
            
            // Verificar si el código aún no ha expirado
            const fechaExpiracionStr = sessionStorage.getItem('zypos_codigo_expiracion');
            let codigoValido = false;
            if (fechaExpiracionStr) {
              const fechaExpiracion = parseInt(fechaExpiracionStr);
              const ahora = Date.now();
              codigoValido = ahora < fechaExpiracion;
            }
            
            // Solo mostrar el mensaje si el código aún es válido
            if (codigoValido) {
              if (datos.email && datos.email.toLowerCase().trim() === emailNormalizado) {
                this.mostrarToast('Ya tienes un registro en proceso. Verifica tu email o espera a que expire el código.', 'warning');
                this.estaCargando = false;
                return;
              }
              if (datos.rut && datos.rut === rutLimpio) {
                this.mostrarToast('Ya tienes un registro en proceso con este RUT. Verifica tu email o espera a que expire el código.', 'warning');
                this.estaCargando = false;
                return;
              }
            }
          } catch (e) {
            // Si hay error parseando, continuamos
          }
        }
        
        // TEMPORALMENTE DESHABILITADO: Verificación de email
        // TODO: Habilitar nuevamente cuando se configure el dominio en Resend
        // 
        // // NO crear cuenta en Auth todavía
        // // Guardar datos temporalmente en sessionStorage para crear la cuenta después de verificar
        // const datosRegistro = {
        //   nombre: nombre,
        //   rut: rutLimpio,
        //   email: email,
        //   contraseña: contraseña
        // };
        // sessionStorage.setItem('zypos_datos_registro_pendiente', JSON.stringify(datosRegistro));

        // // Enviar código de verificación
        // try {
        //   const response = await fetch(`${environment.vercelUrl}/api/enviar-codigo-verificacion`, {
        //     method: 'POST',
        //     headers: {
        //       'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify({
        //       email: email,
        //       nombre: nombre
        //     })
        //   });

        //   const data = await response.json();

        //   if (!response.ok) {
        //     console.error('Error al enviar código:', data);
        //     sessionStorage.removeItem('zypos_datos_registro_pendiente');
        //     throw new Error(data.error || 'Error al enviar el código de verificación');
        //   }

        //   // Guardar fecha de expiración en sessionStorage para evitar envío duplicado
        //   if (data.fechaExpiracion) {
        //     sessionStorage.setItem('zypos_codigo_expiracion', data.fechaExpiracion.toString());
        //   }

        //   this.mostrarToast('Código de verificación enviado a tu email', 'success');
        // } catch (error: any) {
        //   console.error('Error al enviar código de verificación:', error);
        //   sessionStorage.removeItem('zypos_datos_registro_pendiente');
        //   this.mostrarToast(error.message || 'Error al enviar el código de verificación. Intenta nuevamente.', 'danger');
        //   this.estaCargando = false;
        //   return;
        // }

        // // Redirigir a la página de verificación
        // this.router.navigate(['/verificar-email'], { 
        //   replaceUrl: true,
        //   queryParams: { email: email }
        // });

        // CREAR CUENTA DIRECTAMENTE (SIN VERIFICACIÓN DE EMAIL - TEMPORAL)
        try {
          // Crear usuario en Firebase Auth
          const credencialUsuario = await createUserWithEmailAndPassword(
            this.auth,
            emailNormalizado,
            contraseña
          );

          const usuarioId = credencialUsuario.user.uid;
          
          // Configurar plan gratuito (30 días)
          const fechaActual = new Date();
          const fechaInicio = Timestamp.fromDate(fechaActual);
          const fechaVencimiento = new Date(fechaActual);
          fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
          const fechaVencimientoTimestamp = Timestamp.fromDate(fechaVencimiento);
          
          const fechaCreacion = serverTimestamp();

          // Crear documento en Firestore con plan gratuito
          const usuarioRef = doc(this.firestore, 'usuarios', usuarioId);
          await setDoc(usuarioRef, {
            nombre: nombre,
            rut: rutLimpio,
            email: emailNormalizado,
            creacion: fechaCreacion,
            emailVerificado: true, // Temporalmente marcado como verificado
            fechaVerificacionEmail: Timestamp.now(),
            suscripcion: {
              nombre: 'free',
              vence: fechaVencimientoTimestamp,
              fechaInicio: fechaInicio,
              estado: 'activa'
            },
            planGratuitoUsado: true
          });

          this.mostrarToast('Cuenta creada exitosamente', 'success');
          
          // Redirigir a planes (igual que cuando se verificaba el email)
          setTimeout(() => {
            this.router.navigate(['/planes'], { replaceUrl: true });
          }, 2000);
        } catch (errorAuth: any) {
          console.error('Error al crear cuenta:', errorAuth);
          
          let mensajeError = 'Error al crear la cuenta. Por favor, intenta nuevamente.';
          
          if (errorAuth.code === 'auth/email-already-in-use') {
            mensajeError = 'Este email ya está registrado. Por favor, usa otro email o inicia sesión.';
          } else if (errorAuth.code === 'auth/weak-password') {
            mensajeError = 'La contraseña es muy débil. Usa una contraseña más segura.';
          } else if (errorAuth.code === 'auth/invalid-email') {
            mensajeError = 'El email no es válido. Por favor, verifica el formato.';
          } else if (errorAuth.code === 'auth/network-request-failed') {
            mensajeError = 'Error de conexión. Verifica tu internet e intenta nuevamente.';
          }
          
          this.mostrarToast(mensajeError, 'danger');
          this.estaCargando = false;
          return;
        }
        
      } catch (error: any) {
        console.error('Error al registrar usuario:', error);
        
        let mensajeError = 'Error al crear la cuenta. Por favor, intenta nuevamente.';
        
        if (error.code === 'auth/email-already-in-use') {
          mensajeError = 'Este email ya está registrado. Por favor, usa otro email.';
        } else if (error.code === 'auth/weak-password') {
          mensajeError = 'La contraseña es muy débil. Usa una contraseña más segura.';
        } else if (error.code === 'auth/invalid-email') {
          mensajeError = 'El email no es válido. Por favor, verifica el formato.';
        } else if (error.code === 'auth/network-request-failed') {
          mensajeError = 'Error de conexión. Verifica tu internet e intenta nuevamente.';
        }
        
        this.mensajeError = mensajeError;
        this.mostrarToast(mensajeError, 'danger');
      } finally {
        this.estaCargando = false;
      }
      
    } else {
      Object.keys(this.formularioRegistro.controls).forEach(key => {
        this.formularioRegistro.get(key)?.markAsTouched();
      });
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

  alternarVisibilidadContrasena() {
    this.mostrarContrasena = !this.mostrarContrasena;
  }

  alternarVisibilidadConfirmarContrasena() {
    this.mostrarConfirmarContrasena = !this.mostrarConfirmarContrasena;
  }
}