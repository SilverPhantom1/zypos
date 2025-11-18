import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader,IonToolbar, IonTitle, IonContent,IonItem,IonLabel,IonInput,IonButton, ToastController, IonIcon} from '@ionic/angular/standalone';
import { eye, eyeOff } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, doc, setDoc, serverTimestamp, Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-registrarse',
  templateUrl: './registrarse.component.html',
  styleUrls: ['./registrarse.component.scss'],
  standalone: true,
  imports: [IonHeader,IonToolbar,IonTitle, IonContent,IonItem,IonLabel,IonInput,IonButton,IonIcon,ReactiveFormsModule,CommonModule]
})
export class RegistrarseComponent implements OnInit {
  // Formulario
  formularioRegistro!: FormGroup;
  
  // estado de carga
  estaCargando: boolean = false;
  
  // Mensaje de error
  mensajeError: string = '';
  
  // Variables para mostrar/ocultar contraseñas
  mostrarPassword: boolean = false;
  mostrarConfirmarPassword: boolean = false;

  constructor(private formBuilder: FormBuilder,private auth: Auth, private firestore: Firestore,private router: Router,private toastController: ToastController) {
    // Registrar iconos
    addIcons({ eye, eyeOff });
  }

  ngOnInit() {
    //  formulario con validaciones
    this.formularioRegistro = this.formBuilder.group({
      nombre: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      contraseña: ['', [Validators.required, Validators.minLength(6)]],
      confirmarContraseña: ['', [Validators.required]]
    }, {
      //  verificar que las contraseñas coincidan
      validators: this.validarContraseñasCoinciden
    });
  }

  // Función que valida que las contraseñas coincidan
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
    // Verificar que el formulario sea válido
    if (this.formularioRegistro.valid) {
      this.estaCargando = true; // Activar estado de carga
      
      try {
        const { nombre, email, contraseña } = this.formularioRegistro.value;
        
        // Crear usuario en Firebase
        const credencialUsuario = await createUserWithEmailAndPassword(this.auth, email, contraseña);
        const usuarioId = credencialUsuario.user.uid; // ID del usuario
        
        // Calcular fecha de vencimiento del plan Free
        const fechaActual = new Date();
        const fechaVencimiento = new Date(fechaActual);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 30); // Sumar 30 días
        const fechaVencimientoTimestamp = Timestamp.fromDate(fechaVencimiento);
        
        // Crear documento en Firestore
        const fechaCreacion = serverTimestamp();
        
        await setDoc(doc(this.firestore, 'usuarios', usuarioId), {nombre: nombre,email: email,creacion: fechaCreacion,
          suscripcion: {
            nombre: 'free', // Plan Free asignado automáticamente
            vence: fechaVencimientoTimestamp // Vence en 30 días
          }
        });
        

        this.router.navigate(['/home']);
        
      } catch (error: any) {
        console.error('Error al registrar usuario:', error);
        
        // Mensaje de error segun el fallo que pueda haber
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
        this.estaCargando = false; // Desactivar estado de carga
      }
      
    } else {
      Object.keys(this.formularioRegistro.controls).forEach(key => {
        this.formularioRegistro.get(key)?.markAsTouched();
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

  // Función para alternar visibilidad de confirmar contraseña
  alternarVisibilidadConfirmarPassword() {
    this.mostrarConfirmarPassword = !this.mostrarConfirmarPassword;
  }
}