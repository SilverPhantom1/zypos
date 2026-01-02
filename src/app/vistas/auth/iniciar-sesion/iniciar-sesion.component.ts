import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader,IonToolbar, IonContent,IonItem,IonLabel,IonInput,IonButton, ToastController, IonIcon, IonSegment, IonSegmentButton} from '@ionic/angular/standalone';
import { eye, eyeOff } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { Firestore, collection, getDocs, doc, getDoc, updateDoc, query, where } from '@angular/fire/firestore';

@Component({
  selector: 'app-iniciar-sesion',
  templateUrl: './iniciar-sesion.component.html',
  styleUrls: ['./iniciar-sesion.component.scss'],
  standalone: true,
  imports: [ IonHeader,IonToolbar, IonContent,IonItem,IonLabel,IonInput,IonButton,IonIcon,IonSegment,IonSegmentButton,ReactiveFormsModule,FormsModule,CommonModule,RouterLink]
})
export class IniciarSesionComponent implements OnInit {
  formularioLogin!: FormGroup;
  formularioTrabajador!: FormGroup;
  formularioAdmin!: FormGroup;
  tipoLogin: 'propietario' | 'trabajador' | 'administrador' = 'propietario';
  estaCargando: boolean = false;
  mensajeError: string = '';
  mostrarContrasena: boolean = false;
  
  // Credenciales de administrador (deberían estar en variables de entorno en producción)
  private readonly ADMIN_EMAIL = 'admin@zypos.com';
  private readonly ADMIN_PASSWORD = 'AdminZypos2024!';

  constructor(
    private formBuilder: FormBuilder,
    private auth: Auth,
    private router: Router,
    private toastController: ToastController,
    private firestore: Firestore
  ) {
    addIcons({ eye, eyeOff });
  }

  ngOnInit() {
    this.formularioLogin = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      contraseña: ['', [Validators.required]]
    });

    this.formularioTrabajador = this.formBuilder.group({
      rutTrabajador: ['', [Validators.required, this.validarRut.bind(this)]],
      rutEmpleador: ['', [Validators.required, this.validarRut.bind(this)]],
      emailEmpleador: ['', [Validators.required, Validators.email]]
    });

    this.formularioAdmin = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      contraseña: ['', [Validators.required]]
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

  formatearRutInput(event: any, formControlName: string) {
    const valor = event.detail.value || '';
    const rutFormateado = this.formatearRut(valor);
    this.formularioTrabajador.patchValue({ [formControlName]: rutFormateado }, { emitEvent: false });
  }

  cambiarModo(event: any) {
    this.tipoLogin = event.detail.value;
    this.mensajeError = '';
  }

  async enviarFormulario() {
    if (this.tipoLogin === 'administrador') {
      if (this.formularioAdmin.valid) {
        this.estaCargando = true;
        
        try {
          const { email, contraseña } = this.formularioAdmin.value;
          
          // Verificar credenciales de administrador
          if (email.toLowerCase().trim() === this.ADMIN_EMAIL && contraseña === this.ADMIN_PASSWORD) {
            // Guardar sesión de administrador en sessionStorage
            sessionStorage.setItem('zypos_sesion_administrador', 'true');
            sessionStorage.setItem('zypos_admin_email', email.toLowerCase().trim());
            
            this.router.navigate(['/admin']);
          } else {
            this.mensajeError = 'Credenciales de administrador incorrectas.';
            this.mostrarToast(this.mensajeError, 'danger');
          }
        } catch (error: any) {
          console.error('Error al iniciar sesión como administrador:', error);
          this.mensajeError = 'Error al iniciar sesión. Por favor, intenta nuevamente.';
          this.mostrarToast(this.mensajeError, 'danger');
        } finally {
          this.estaCargando = false;
        }
      } else {
        Object.keys(this.formularioAdmin.controls).forEach(key => {
          this.formularioAdmin.get(key)?.markAsTouched();
        });
      }
    } else if (this.tipoLogin === 'propietario') {
    if (this.formularioLogin.valid) {
      this.estaCargando = true;
      
      try {
        const { email, contraseña } = this.formularioLogin.value;
        
        await signInWithEmailAndPassword(this.auth, email, contraseña);
          
          // Verificar si el email está verificado
          const usuariosRef = collection(this.firestore, 'usuarios');
          const q = query(usuariosRef, where('email', '==', email.toLowerCase().trim()));
          const usuarioSnapshot = await getDocs(q);
          
          if (!usuarioSnapshot.empty) {
            const usuarioDoc = usuarioSnapshot.docs[0];
            const usuarioData = usuarioDoc.data();
            
            // Si el email no está verificado, redirigir a verificación
            if (usuarioData['emailVerificado'] === false || usuarioData['emailVerificado'] === undefined) {
              // Cerrar sesión para que no pueda acceder
              await signOut(this.auth);
              this.mostrarToast('Por favor, verifica tu email antes de iniciar sesión. Revisa tu correo electrónico.', 'warning');
              this.router.navigate(['/verificar-email'], { 
                queryParams: { email: email } 
              });
              return;
            }
          }
          
        this.router.navigate(['/home']);
        
      } catch (error: any) {
        console.error('Error al iniciar sesión:', error);
        
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
        this.estaCargando = false;
      }
    } else {
      Object.keys(this.formularioLogin.controls).forEach(key => {
        this.formularioLogin.get(key)?.markAsTouched();
      });
      }
    } else {
      if (this.formularioTrabajador.valid) {
        this.estaCargando = true;
        try {
          const { rutTrabajador, rutEmpleador, emailEmpleador } = this.formularioTrabajador.value;
          const rutTrabajadorLimpio = this.limpiarRut(rutTrabajador);
          const rutEmpleadorLimpio = this.limpiarRut(rutEmpleador);
          const emailEmpleadorLimpio = emailEmpleador.toLowerCase().trim();

          const usuariosRef = collection(this.firestore, 'usuarios');
          const q = query(usuariosRef, where('email', '==', emailEmpleadorLimpio));
          const usuarioSnapshot = await getDocs(q);
          
          const empleadorDoc = usuarioSnapshot.docs.find(doc => {
            const data = doc.data();
            return data['rut'] === rutEmpleadorLimpio;
          });
          
          if (!empleadorDoc) {
            throw new Error('No se encontró un empleador con esos datos');
          }

          const empleadorId = empleadorDoc.id;
          const trabajadoresRef = collection(this.firestore, 'usuarios', empleadorId, 'trabajadores');
          const trabajadorQuery = query(trabajadoresRef, where('rut', '==', rutTrabajadorLimpio), where('activo', '==', true));
          const trabajadorSnapshot = await getDocs(trabajadorQuery);

          if (trabajadorSnapshot.empty) {
            throw new Error('Trabajador no encontrado o inactivo');
          }

          const trabajadorDoc = trabajadorSnapshot.docs[0];

          if (!trabajadorDoc) {
            throw new Error('Trabajador no encontrado o inactivo');
          }

          const trabajadorData = trabajadorDoc.data();
          const emailGenerado = trabajadorData['emailGenerado'];
          const contraseñaGenerada = trabajadorData['contraseñaGenerada'];

          if (!emailGenerado || !contraseñaGenerada) {
            throw new Error('Datos de autenticación del trabajador no encontrados');
          }

          let authUid = trabajadorData['authUid'];
          
          if (!authUid) {
            try {
              const credencialTrabajador = await createUserWithEmailAndPassword(this.auth, emailGenerado, contraseñaGenerada);
              authUid = credencialTrabajador.user.uid;
            } catch (authError: any) {
              if (authError.code === 'auth/email-already-in-use') {
                await signInWithEmailAndPassword(this.auth, emailGenerado, contraseñaGenerada);
                const currentUser = this.auth.currentUser;
                if (currentUser) {
                  authUid = currentUser.uid;
                }
              } else {
                throw new Error('Error al crear la cuenta del trabajador: ' + (authError.message || 'Error desconocido'));
              }
            }
          } else {
            await signInWithEmailAndPassword(this.auth, emailGenerado, contraseñaGenerada);
          }

          const sesion = {
            trabajadorId: trabajadorDoc.id,
            trabajadorNombre: trabajadorData['nombre'],
            trabajadorRut: trabajadorData['rut'],
            empleadorId: empleadorId,
            empleadorRut: empleadorDoc.data()['rut'],
            empleadorEmail: empleadorDoc.data()['email'],
            fechaInicio: new Date()
          };
          sessionStorage.setItem('zypos_sesion_trabajador', JSON.stringify(sesion));
          
          this.router.navigate(['/ventas']);

        } catch (error: any) {
          console.error('Error al autenticar trabajador:', error);
          let mensaje = 'Error al autenticar trabajador. Verifica los datos.';
          if (error.message?.includes('No se encontró un empleador')) {
            mensaje = 'Datos de empleador incorrectos.';
          } else if (error.message?.includes('Trabajador no encontrado')) {
            mensaje = 'Trabajador no encontrado o inactivo.';
          } else if (error.message?.includes('Datos de autenticación')) {
            mensaje = 'Error en los datos del trabajador. Contacta al administrador.';
          } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            mensaje = 'Error de autenticación. Contacta al administrador.';
          } else if (error.code === 'permission-denied' || error.code === 'missing-or-insufficient-permissions') {
            mensaje = 'Error de permisos. Verifica las reglas de seguridad de Firestore.';
          }
          this.mensajeError = mensaje;
          this.mostrarToast(mensaje, 'danger');
        } finally {
          this.estaCargando = false;
        }
      } else {
        Object.keys(this.formularioTrabajador.controls).forEach(key => {
          this.formularioTrabajador.get(key)?.markAsTouched();
        });
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

  alternarVisibilidadContrasena() {
    this.mostrarContrasena = !this.mostrarContrasena;
  }
}
