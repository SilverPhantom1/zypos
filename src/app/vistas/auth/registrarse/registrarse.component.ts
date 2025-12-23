import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader,IonToolbar, IonContent,IonItem,IonLabel,IonInput,IonButton, ToastController, IonIcon} from '@ionic/angular/standalone';
import { eye, eyeOff } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, doc, setDoc, serverTimestamp, Timestamp } from '@angular/fire/firestore';

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
        
        const credencialUsuario = await createUserWithEmailAndPassword(this.auth, email, contraseña);
        const usuarioId = credencialUsuario.user.uid;
        
        const fechaActual = new Date();
        const fechaInicio = Timestamp.fromDate(fechaActual);
        const fechaVencimiento = new Date(fechaActual);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
        const fechaVencimientoTimestamp = Timestamp.fromDate(fechaVencimiento);
        
        const fechaCreacion = serverTimestamp();
        
        await setDoc(doc(this.firestore, 'usuarios', usuarioId), {nombre: nombre,rut: rutLimpio,email: email,creacion: fechaCreacion,
          suscripcion: {
            nombre: 'free',
            vence: fechaVencimientoTimestamp,
            fechaInicio: fechaInicio,
            estado: 'activa'
          },
          planGratuitoUsado: true
        });

        this.router.navigate(['/planes'], { replaceUrl: true });
        
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