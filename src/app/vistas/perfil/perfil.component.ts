import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonItem, IonLabel, IonInput, IonButton, IonIcon, ToastController } from '@ionic/angular/standalone';
import { personCircle, logOut, save, eye, eyeOff, checkmarkCircle, arrowBack } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Auth, onAuthStateChanged, signOut, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, User } from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc, Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.component.html',
  styleUrls: ['./perfil.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonItem, IonLabel, IonInput, IonButton, IonIcon, ReactiveFormsModule, CommonModule, RouterLink]
})
export class PerfilComponent implements OnInit {
  usuarioId: string | null = null;
  datosUsuario: any = null;
  estaCargando: boolean = false;
  verificandoAuth: boolean = true;
  
  formularioDatos: FormGroup;
  formularioEmail: FormGroup;
  formularioPassword: FormGroup;
  formularioTelefono: FormGroup;
  
  editandoDatos: boolean = false;
  editandoEmpresa: boolean = false;
  editandoEmail: boolean = false;
  editandoPassword: boolean = false;
  editandoTelefono: boolean = false;
  
  mostrarPasswordActual: boolean = false;
  mostrarPasswordNueva: boolean = false;
  mostrarPasswordConfirmar: boolean = false;
  
  planActual: string = '';
  fechaVencimiento: Date | null = null;

  constructor(private formBuilder: FormBuilder,private auth: Auth,private firestore: Firestore,private router: Router,private toastController: ToastController
  ) {
    addIcons({ personCircle, logOut, save, eye, eyeOff, checkmarkCircle, arrowBack });
    
    this.formularioDatos = this.formBuilder.group({
      nombre: ['', [Validators.required]],
      nombreEmpresa: ['']
    });
    
    this.formularioEmail = this.formBuilder.group({
      contrasenaActual: ['', [Validators.required]],
      nuevoEmail: ['', [Validators.required, Validators.email]],
      confirmarEmail: ['', [Validators.required, Validators.email]]
    }, {
      validators: this.validarEmailsCoinciden
    });
    
    this.formularioPassword = this.formBuilder.group({
      contrasenaActual: ['', [Validators.required]],
      contrasenaNueva: ['', [Validators.required, Validators.minLength(6)]],
      contrasenaConfirmar: ['', [Validators.required]]
    }, {
      validators: this.validarPasswordsCoinciden
    });
    
    this.formularioTelefono = this.formBuilder.group({
      telefono: ['', [Validators.required, Validators.pattern(/^[0-9+\-\s()]+$/)]]
    });
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
    
    this.estaCargando = true;
    try {
      const usuarioDoc = await getDoc(doc(this.firestore, 'usuarios', this.usuarioId));
      
      if (usuarioDoc.exists()) {
        this.datosUsuario = usuarioDoc.data();
        
        this.formularioDatos.patchValue({
          nombre: this.datosUsuario.nombre || '',
          nombreEmpresa: this.datosUsuario.nombreEmpresa || ''
        });
        
        this.formularioTelefono.patchValue({
          telefono: this.datosUsuario.telefono || ''
        });
        
        if (this.datosUsuario.suscripcion) {
          this.planActual = this.datosUsuario.suscripcion.nombre || 'free';
          if (this.datosUsuario.suscripcion.vence) {
            const vence = this.datosUsuario.suscripcion.vence as Timestamp;
            this.fechaVencimiento = vence.toDate();
          }
        }
      }
    } catch (error) {
      console.error('Error al cargar datos del usuario:', error);
      this.mostrarToast('Error al cargar los datos del perfil', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  validarEmailsCoinciden(formGroup: FormGroup) {
    const nuevoEmail = formGroup.get('nuevoEmail')?.value;
    const confirmarEmail = formGroup.get('confirmarEmail')?.value;
    
    if (nuevoEmail && confirmarEmail && nuevoEmail !== confirmarEmail) {
      formGroup.get('confirmarEmail')?.setErrors({ emailsNoCoinciden: true });
      return { emailsNoCoinciden: true };
    }
    return null;
  }

  validarPasswordsCoinciden(formGroup: FormGroup) {
    const contrasenaNueva = formGroup.get('contrasenaNueva')?.value;
    const contrasenaConfirmar = formGroup.get('contrasenaConfirmar')?.value;
    
    if (contrasenaNueva && contrasenaConfirmar && contrasenaNueva !== contrasenaConfirmar) {
      formGroup.get('contrasenaConfirmar')?.setErrors({ contrasenasNoCoinciden: true });
      return { contrasenasNoCoinciden: true };
    }
    return null;
  }

  async guardarDatos() {
    if (this.formularioDatos.invalid || !this.usuarioId) return;
    
    this.estaCargando = true;
    try {
      const { nombre } = this.formularioDatos.value;
      
      await setDoc(doc(this.firestore, 'usuarios', this.usuarioId), {
        nombre: nombre
      }, { merge: true });
      
      this.editandoDatos = false;
      await this.cargarDatosUsuario();
      this.mostrarToast('Datos actualizados correctamente', 'success');
    } catch (error) {
      console.error('Error al actualizar datos:', error);
      this.mostrarToast('Error al actualizar los datos', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  async guardarEmpresa() {
    if (!this.usuarioId) return;
    
    this.estaCargando = true;
    try {
      const { nombreEmpresa } = this.formularioDatos.value;
      
      await setDoc(doc(this.firestore, 'usuarios', this.usuarioId), {
        nombreEmpresa: nombreEmpresa || ''
      }, { merge: true });
      
      this.editandoEmpresa = false;
      await this.cargarDatosUsuario();
      this.mostrarToast('Datos de empresa actualizados correctamente', 'success');
    } catch (error) {
      console.error('Error al actualizar empresa:', error);
      this.mostrarToast('Error al actualizar los datos de empresa', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  async guardarEmail() {
    if (this.formularioEmail.invalid || !this.usuarioId) return;
    
    this.estaCargando = true;
    try {
      const { contrasenaActual, nuevoEmail } = this.formularioEmail.value;
      const user = this.auth.currentUser;
      
      if (!user || !user.email) {
        this.mostrarToast('Usuario no autenticado', 'danger');
        return;
      }
      
      const credential = EmailAuthProvider.credential(user.email, contrasenaActual);
      await reauthenticateWithCredential(user, credential);
      await updateEmail(user, nuevoEmail);
      await setDoc(doc(this.firestore, 'usuarios', this.usuarioId), {
        email: nuevoEmail
      }, { merge: true });
      
      this.editandoEmail = false;
      this.formularioEmail.reset();
      await this.cargarDatosUsuario();
      this.mostrarToast('Email actualizado correctamente', 'success');
    } catch (error: any) {
      console.error('Error al actualizar email:', error);
      let mensaje = 'Error al actualizar el email';
      
      if (error.code === 'auth/email-already-in-use') {
        mensaje = 'Este email ya está en uso';
      } else if (error.code === 'auth/invalid-email') {
        mensaje = 'Email inválido';
      } else if (error.code === 'auth/wrong-password') {
        mensaje = 'Contraseña incorrecta';
      } else if (error.code === 'auth/requires-recent-login') {
        mensaje = 'Por seguridad, debes iniciar sesión nuevamente';
      }
      
      this.mostrarToast(mensaje, 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  async guardarPassword() {
    if (this.formularioPassword.invalid || !this.usuarioId) return;
    
    this.estaCargando = true;
    try {
      const { contrasenaActual, contrasenaNueva } = this.formularioPassword.value;
      const user = this.auth.currentUser;
      
      if (!user || !user.email) {
        this.mostrarToast('Usuario no autenticado', 'danger');
        return;
      }
      
      const credential = EmailAuthProvider.credential(user.email, contrasenaActual);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, contrasenaNueva);
      
      this.editandoPassword = false;
      this.formularioPassword.reset();
      this.mostrarToast('Contraseña actualizada correctamente', 'success');
    } catch (error: any) {
      console.error('Error al actualizar contraseña:', error);
      let mensaje = 'Error al actualizar la contraseña';
      
      if (error.code === 'auth/wrong-password') {
        mensaje = 'La contraseña actual es incorrecta';
      } else if (error.code === 'auth/weak-password') {
        mensaje = 'La nueva contraseña es muy débil';
      } else if (error.code === 'auth/requires-recent-login') {
        mensaje = 'Por seguridad, debes iniciar sesión nuevamente';
      }
      
      this.mostrarToast(mensaje, 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  async guardarTelefono() {
    if (this.formularioTelefono.invalid || !this.usuarioId) return;
    
    this.estaCargando = true;
    try {
      const { telefono } = this.formularioTelefono.value;
      
      await setDoc(doc(this.firestore, 'usuarios', this.usuarioId), {
        telefono: telefono
      }, { merge: true });
      
      this.editandoTelefono = false;
      await this.cargarDatosUsuario();
      this.mostrarToast('Teléfono actualizado correctamente', 'success');
    } catch (error) {
      console.error('Error al actualizar teléfono:', error);
      this.mostrarToast('Error al actualizar el teléfono', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  volverAtras() {
    this.router.navigate(['/home']);
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

  alternarVisibilidadPasswordActual() {
    this.mostrarPasswordActual = !this.mostrarPasswordActual;
  }

  alternarVisibilidadPasswordNueva() {
    this.mostrarPasswordNueva = !this.mostrarPasswordNueva;
  }

  alternarVisibilidadPasswordConfirmar() {
    this.mostrarPasswordConfirmar = !this.mostrarPasswordConfirmar;
  }

  // Formatear fecha
  formatearFecha(fecha: Date): string {
    return fecha.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  calcularTiempoRestante(): string {
    const ahora = new Date();
    const vencimiento = new Date(this.fechaVencimiento!);
    const diferencia = vencimiento.getTime() - ahora.getTime();

    if (diferencia < 0) {
      return 'Vencido';
    }

    const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const meses = Math.floor(dias / 30);
    const semanas = Math.floor(dias / 7);

    if (meses > 0) {
      const diasRestantes = dias % 30;
      if (diasRestantes > 0) {
        return `${meses} ${meses === 1 ? 'mes' : 'meses'} y ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}`;
      }
      return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
    } else if (semanas > 0) {
      const diasRestantes = dias % 7;
      if (diasRestantes > 0) {
        return `${semanas} ${semanas === 1 ? 'semana' : 'semanas'} y ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}`;
      }
      return `${semanas} ${semanas === 1 ? 'semana' : 'semanas'}`;
    } else if (dias > 0) {
      if (horas > 0) {
        return `${dias} ${dias === 1 ? 'día' : 'días'} y ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
      }
      return `${dias} ${dias === 1 ? 'día' : 'días'}`;
    } else {
      return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
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
