import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonModal, IonButtons, IonTitle, IonBadge, ToastController, AlertController } from '@ionic/angular/standalone';
import { arrowBack, add, people, peopleOutline, checkmarkCircle, closeCircle, close, trash } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, Timestamp } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

interface Trabajador {
  id?: string;
  rut: string;
  nombre: string;
  empleadorId: string;
  empleadorRut: string;
  empleadorEmail: string;
  authUid: string;
  emailGenerado: string;
  activo: boolean;
  fechaCreacion: Timestamp | Date;
}

@Component({
  selector: 'app-gestion-trabajadores',
  templateUrl: './gestion-trabajadores.component.html',
  styleUrls: ['./gestion-trabajadores.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonModal, IonButtons, IonTitle, IonBadge, CommonModule, ReactiveFormsModule]
})
export class GestionTrabajadoresComponent implements OnInit {
  verificandoAuth: boolean = true;
  usuarioId: string | null = null;
  trabajadores: Trabajador[] = [];
  estaCargando: boolean = false;
  mostrandoModal: boolean = false;
  formularioTrabajador!: FormGroup;

  constructor(
    private auth: Auth,
    private router: Router,
    private firestore: Firestore,
    private formBuilder: FormBuilder,
    private toastController: ToastController,
    private alertController: AlertController
  ) {
    addIcons({ arrowBack, add, people, peopleOutline, checkmarkCircle, closeCircle, close, trash });
  }

  async ngOnInit() {
    const sesionTrabajador = sessionStorage.getItem('zypos_sesion_trabajador');
    if (sesionTrabajador) {
      this.router.navigate(['/ventas'], { replaceUrl: true });
      return;
    }

    onAuthStateChanged(this.auth, async (user) => {
      if (user) {
        this.usuarioId = user.uid;
        console.log('Usuario autenticado. UID:', user.uid, 'Email:', user.email);
        this.verificandoAuth = false;
        await this.cargarTrabajadores();
      } else {
        this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      }
    });
  }

  async cargarTrabajadores() {
    if (!this.usuarioId) return;
    
    this.estaCargando = true;
    try {
      const trabajadoresRef = collection(this.firestore, 'usuarios', this.usuarioId, 'trabajadores');
      const snapshot = await getDocs(trabajadoresRef);

      this.trabajadores = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Trabajador[];

      this.trabajadores.sort((a, b) => {
        const fechaA = a.fechaCreacion instanceof Timestamp ? a.fechaCreacion.toDate() : new Date(a.fechaCreacion);
        const fechaB = b.fechaCreacion instanceof Timestamp ? b.fechaCreacion.toDate() : new Date(b.fechaCreacion);
        return fechaB.getTime() - fechaA.getTime();
      });

    } catch (error: any) {
      console.error('Error al cargar trabajadores:', error);
      this.mostrarToast('Error al cargar trabajadores', 'danger');
      this.trabajadores = [];
    } finally {
      this.estaCargando = false;
    }
  }

  abrirModal() {
    if (!this.usuarioId) {
      this.mostrarToast('Error: No se pudo identificar al usuario. Por favor, recarga la página.', 'danger');
      return;
    }
    
    this.formularioTrabajador = this.formBuilder.group({
      rut: ['', [Validators.required, this.validarRut.bind(this)]],
      nombre: ['', [Validators.required]]
    });
    this.mostrandoModal = true;
  }

  cerrarModal() {
    this.mostrandoModal = false;
    this.formularioTrabajador.reset();
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
    this.formularioTrabajador.patchValue({ rut: rutFormateado }, { emitEvent: false });
  }

  generarContraseña(): string {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
    let contraseña = '';
    contraseña += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    contraseña += '0123456789'[Math.floor(Math.random() * 10)];
    contraseña += '!@#$%&*'[Math.floor(Math.random() * 7)];
    for (let i = 3; i < 12; i++) {
      contraseña += caracteres[Math.floor(Math.random() * caracteres.length)];
    }
    return contraseña.split('').sort(() => Math.random() - 0.5).join('');
  }

  async agregarTrabajador() {
    if (!this.formularioTrabajador.valid) {
      Object.keys(this.formularioTrabajador.controls).forEach(key => {
        this.formularioTrabajador.get(key)?.markAsTouched();
      });
      return;
    }

    if (!this.usuarioId) {
      this.mostrarToast('Error: No se pudo identificar al usuario. Por favor, recarga la página.', 'danger');
      return;
    }

    this.estaCargando = true;
    try {
      const { rut, nombre } = this.formularioTrabajador.value;
      const rutLimpio = this.limpiarRut(rut);
      
      if (!this.usuarioId) {
        throw new Error('Usuario no autenticado');
      }

      console.log('Buscando documento de usuario con ID:', this.usuarioId);
      
      let empleadorDoc;
      try {
        const usuarioDocRef = doc(this.firestore, 'usuarios', this.usuarioId);
        empleadorDoc = await getDoc(usuarioDocRef);
        console.log('Documento encontrado:', empleadorDoc.exists());
      } catch (docError: any) {
        console.error('Error al obtener documento de usuario:', docError);
        if (docError.code === 'permission-denied' || docError.code === 'missing-or-insufficient-permissions') {
          throw new Error('Error de permisos. Verifica las reglas de seguridad de Firestore.');
        }
        throw new Error('Error al acceder a tu información de usuario. Por favor, intenta nuevamente.');
      }
      
      if (!empleadorDoc || !empleadorDoc.exists()) {
        console.error('Documento de usuario no encontrado. UsuarioId:', this.usuarioId);
        throw new Error(`No se encontró tu información de usuario con ID: ${this.usuarioId}. Por favor, verifica que estés iniciando sesión con la cuenta correcta o regístrate nuevamente.`);
      }

      const empleadorData = empleadorDoc.data();
      const empleadorRut = empleadorData?.['rut'];
      const empleadorEmail = empleadorData?.['email'];

      if (rutLimpio === empleadorRut) {
        throw new Error('No puedes registrar tu propio RUT como trabajador');
      }

      const trabajadoresRef = collection(this.firestore, 'usuarios', this.usuarioId, 'trabajadores');
      const existenteSnapshot = await getDocs(trabajadoresRef);
      
      const trabajadorExistente = existenteSnapshot.docs.find(doc => {
        const data = doc.data();
        return data['rut'] === rutLimpio;
      });
      
      if (trabajadorExistente) {
        throw new Error('Este trabajador ya está registrado');
      }

      const dominioEmail = empleadorEmail.split('@')[1];
      const emailGenerado = `trabajador-${rutLimpio}@${dominioEmail}`;
      const contraseñaGenerada = this.generarContraseña();

      const nuevoTrabajador = {
        rut: rutLimpio,
        nombre: nombre.trim(),
        empleadorId: this.usuarioId,
        empleadorRut: empleadorRut,
        empleadorEmail: empleadorEmail,
        emailGenerado: emailGenerado,
        contraseñaGenerada: contraseñaGenerada,
        activo: true,
        fechaCreacion: Timestamp.now()
      };
      
      await addDoc(trabajadoresRef, nuevoTrabajador);

      this.cerrarModal();
      await this.cargarTrabajadores();
      this.mostrarToast('Trabajador agregado correctamente', 'success');

    } catch (error: any) {
      console.error('Error al agregar trabajador:', error);
      let mensaje = 'Error al agregar el trabajador';
      if (error.message?.includes('ya está registrado')) {
        mensaje = error.message;
      } else if (error.message?.includes('No puedes registrar')) {
        mensaje = error.message;
      } else if (error.message?.includes('No se encontró tu información')) {
        mensaje = error.message;
      } else if (error.message?.includes('Usuario no autenticado')) {
        mensaje = error.message;
      } else if (error.code === 'auth/email-already-in-use') {
        mensaje = 'El email generado ya está en uso. Intenta nuevamente.';
      } else if (error.code === 'permission-denied' || error.code === 'missing-or-insufficient-permissions') {
        mensaje = 'Error de permisos. Verifica las reglas de seguridad de Firestore.';
      } else if (error.message) {
        mensaje = error.message;
      }
      this.mostrarToast(mensaje, 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  async cambiarEstadoTrabajador(trabajador: Trabajador) {
    if (!trabajador.id || !this.usuarioId) return;

    const nuevoEstado = !trabajador.activo;
    const accion = nuevoEstado ? 'activar' : 'desactivar';

    const alert = await this.alertController.create({
      header: `${accion.charAt(0).toUpperCase() + accion.slice(1)} Trabajador`,
      message: `¿Estás seguro de ${accion} a ${trabajador.nombre}?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: accion.charAt(0).toUpperCase() + accion.slice(1),
          handler: async () => {
            if (!this.usuarioId || !trabajador.id) return;
            try {
              await updateDoc(doc(this.firestore, 'usuarios', this.usuarioId, 'trabajadores', trabajador.id), { activo: nuevoEstado });
              this.mostrarToast(`Trabajador ${nuevoEstado ? 'activado' : 'desactivado'} correctamente`, 'success');
              await this.cargarTrabajadores();
            } catch (error) {
              console.error('Error al cambiar estado:', error);
              this.mostrarToast('Error al cambiar estado del trabajador', 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async eliminarTrabajador(trabajador: Trabajador) {
    if (!trabajador.id || !this.usuarioId) return;

    const alert = await this.alertController.create({
      header: 'Eliminar Trabajador',
      message: `¿Estás seguro de eliminar a ${trabajador.nombre}? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            if (!this.usuarioId || !trabajador.id) return;
            this.estaCargando = true;
            try {
              await deleteDoc(doc(this.firestore, 'usuarios', this.usuarioId, 'trabajadores', trabajador.id));
              this.mostrarToast('Trabajador eliminado correctamente', 'success');
              await this.cargarTrabajadores();
            } catch (error) {
              console.error('Error al eliminar trabajador:', error);
              this.mostrarToast('Error al eliminar el trabajador', 'danger');
            } finally {
              this.estaCargando = false;
            }
          }
        }
      ]
    });
    await alert.present();
  }

  volverAtras(): void {
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  async mostrarToast(mensaje: string, color: string = 'danger'): Promise<void> {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 3000,
      position: 'top',
      color: color
    });
    await toast.present();
  }
}

