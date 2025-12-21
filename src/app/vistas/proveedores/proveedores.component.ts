import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonTextarea, ToastController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonSearchbar, IonModal, IonButtons, IonTitle, AlertController } from '@ionic/angular/standalone';
import { arrowBack, add, save, close, create, trash, checkmark, storefront, call, mail, location, link, documentText } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, orderBy } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-proveedores',
  templateUrl: './proveedores.component.html',
  styleUrls: ['./proveedores.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonTextarea, CommonModule, ReactiveFormsModule, FormsModule, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonSearchbar, IonModal, IonButtons, IonTitle]
})
export class ProveedoresComponent implements OnInit {
  verificandoAuth: boolean = true;
  usuarioId: string | null = null;
  
  proveedores: any[] = [];
  proveedoresFiltrados: any[] = [];
  estaCargandoProveedores: boolean = false;
  
  terminoBusqueda: string = '';
  ordenamiento: 'nombre-asc' | 'nombre-desc' = 'nombre-asc';
  
  mostrandoModalProveedor: boolean = false;
  proveedorEditando: any = null;
  formularioProveedor!: FormGroup;
  estaCargando: boolean = false;

  constructor(
    private auth: Auth,
    private router: Router,
    private firestore: Firestore,
    private formBuilder: FormBuilder,
    private toastController: ToastController,
    private alertController: AlertController
  ) {
    addIcons({ arrowBack, add, save, close, create, trash, checkmark, storefront, call, mail, location, link, documentText });
  }

  async ngOnInit() {
    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      } else {
        if (user.uid !== this.usuarioId) {
          this.usuarioId = user.uid;
          this.verificandoAuth = false;
          
          this.inicializarFormulario();
          await this.cargarProveedores();
        }
      }
    });
  }

  inicializarFormulario() {
    this.formularioProveedor = this.formBuilder.group({
      nombre: ['', [Validators.required]],
      telefono: [''],
      email: ['', [Validators.email]],
      direccion: [''],
      enlaceCompra: [''],
      descripcion: ['']
    });
  }

  async cargarProveedores() {
    if (!this.usuarioId) {
      console.warn('No hay usuarioId, no se pueden cargar proveedores');
      this.proveedores = [];
      this.proveedoresFiltrados = [];
      return;
    }
    
    this.estaCargandoProveedores = true;
    
    try {
      const proveedoresRef = collection(this.firestore, 'proveedores');
      
      try {
        const q = query(proveedoresRef, where('userId', '==', this.usuarioId), orderBy('nombre', 'asc'));
        const querySnapshot = await getDocs(q);
        
        this.proveedores = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } catch (errorOrderBy: any) {
        if (errorOrderBy.code === 'failed-precondition') {
          const q = query(proveedoresRef, where('userId', '==', this.usuarioId));
          const querySnapshot = await getDocs(q);
          
          this.proveedores = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        } else {
          throw errorOrderBy;
        }
      }
      
      this.aplicarFiltrosYOrdenamiento();
      
    } catch (error: any) {
      console.error('Error al cargar proveedores:', error);
      
      this.proveedores = [];
      this.proveedoresFiltrados = [];
      
      // No mostrar error al usuario (similar a categorías)
      if (error.code !== 'permission-denied' && error.code !== 'missing-or-insufficient-permissions') {
        console.error('Error no relacionado con permisos:', error);
      }
    } finally {
      this.estaCargandoProveedores = false;
    }
  }

  // Aplicar filtros y ordenamiento
  aplicarFiltrosYOrdenamiento() {
    let resultado = [...this.proveedores];
    
    // Aplicar búsqueda
    if (this.terminoBusqueda.trim()) {
      const busqueda = this.terminoBusqueda.toLowerCase().trim();
      resultado = resultado.filter(proveedor => {
        const nombre = (proveedor.nombre || '').toLowerCase();
        const telefono = (proveedor.telefono || '').toLowerCase();
        const email = (proveedor.email || '').toLowerCase();
        const contacto = `${telefono} ${email}`.toLowerCase();
        
        return nombre.includes(busqueda) || contacto.includes(busqueda);
      });
    }
    
    // Aplicar ordenamiento
    resultado.sort((a, b) => {
      const nombreA = (a.nombre || '').toLowerCase();
      const nombreB = (b.nombre || '').toLowerCase();
      
      if (this.ordenamiento === 'nombre-asc') {
        return nombreA.localeCompare(nombreB);
      } else {
        return nombreB.localeCompare(nombreA);
      }
    });
    
    this.proveedoresFiltrados = resultado;
  }

  onBuscar(event: any) {
    this.terminoBusqueda = event.detail.value || '';
    this.aplicarFiltrosYOrdenamiento();
  }

  cambiarOrdenamiento() {
    this.ordenamiento = this.ordenamiento === 'nombre-asc' ? 'nombre-desc' : 'nombre-asc';
    this.aplicarFiltrosYOrdenamiento();
  }

  abrirModalCrear() {
    this.proveedorEditando = null;
    this.inicializarFormulario();
    this.mostrandoModalProveedor = true;
  }

  abrirModalEditar(proveedor: any) {
    this.proveedorEditando = proveedor;
    this.formularioProveedor.patchValue({
      nombre: proveedor.nombre || '',
      telefono: proveedor.telefono || '',
      email: proveedor.email || '',
      direccion: proveedor.direccion || '',
      enlaceCompra: proveedor.enlaceCompra || '',
      descripcion: proveedor.descripcion || ''
    });
    this.mostrandoModalProveedor = true;
  }

  cerrarModal() {
    this.mostrandoModalProveedor = false;
    this.proveedorEditando = null;
    this.inicializarFormulario();
  }

  async guardarProveedor() {
    if (this.formularioProveedor.invalid || !this.usuarioId) {
      this.formularioProveedor.markAllAsTouched();
      return;
    }

    this.estaCargando = true;

    try {
      const valores = this.formularioProveedor.value;
      const datosProveedor: any = {
        nombre: valores.nombre.trim(),
        telefono: valores.telefono?.trim() || '',
        email: valores.email?.trim() || '',
        direccion: valores.direccion?.trim() || '',
        enlaceCompra: valores.enlaceCompra?.trim() || '',
        descripcion: valores.descripcion?.trim() || '',
        userId: this.usuarioId
      };

      if (this.proveedorEditando) {
        const proveedorRef = doc(this.firestore, 'proveedores', this.proveedorEditando.id);
        await updateDoc(proveedorRef, datosProveedor);
        
        console.log('Proveedor actualizado:', this.proveedorEditando.id);
        this.mostrarToast('Proveedor actualizado exitosamente', 'success');
      } else {
        const docRef = await addDoc(collection(this.firestore, 'proveedores'), datosProveedor);
        
        console.log('Proveedor creado con ID:', docRef.id, 'userId:', this.usuarioId);
        console.log('Datos guardados:', datosProveedor);
        this.mostrarToast('Proveedor creado exitosamente', 'success');
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      await this.cargarProveedores();
      
      console.log('Proveedores después de recargar:', this.proveedores.length);
      this.cerrarModal();
    } catch (error: any) {
      console.error('Error al guardar proveedor:', error);
      let mensajeError = 'Error al guardar el proveedor';
      if (error.code === 'permission-denied' || error.code === 'missing-or-insufficient-permissions') {
        mensajeError = 'Error de permisos. Verifica las reglas de Firestore.';
      }
      this.mostrarToast(mensajeError, 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  async contarProductosProveedor(proveedorId: string): Promise<number> {
    if (!this.usuarioId) return 0;

    try {
      const productosRef = collection(this.firestore, 'productos');
      const q = query(
        productosRef,
        where('userId', '==', this.usuarioId),
        where('proveedorId', '==', proveedorId)
      );
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('Error al contar productos:', error);
      return 0;
    }
  }

  async eliminarProveedor(proveedor: any) {
    if (!this.usuarioId) return;

    const cantidadProductos = await this.contarProductosProveedor(proveedor.id);

    const mensajeAdvertencia = cantidadProductos > 0
      ? `¿Estás seguro de eliminar el proveedor "${proveedor.nombre}"? Esta acción eliminará el proveedor y dejará ${cantidadProductos} producto(s) sin proveedor. Los productos seguirán funcionando normalmente y podrás asignarles un nuevo proveedor cuando lo desees.`
      : `¿Estás seguro de eliminar el proveedor "${proveedor.nombre}"?`;

    const alert = await this.alertController.create({
      header: 'Eliminar Proveedor',
      message: mensajeAdvertencia,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            try {
              if (cantidadProductos > 0) {
                await this.actualizarProductosSinProveedor(proveedor.id);
              }

              const proveedorRef = doc(this.firestore, 'proveedores', proveedor.id);
              await deleteDoc(proveedorRef);

              await this.cargarProveedores();
              this.mostrarToast('Proveedor eliminado exitosamente', 'success');
            } catch (error: any) {
              console.error('Error al eliminar proveedor:', error);
              let mensajeError = 'Error al eliminar el proveedor';
              if (error.code === 'permission-denied' || error.code === 'missing-or-insufficient-permissions') {
                mensajeError = 'Error de permisos. Verifica las reglas de Firestore.';
              }
              this.mostrarToast(mensajeError, 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async actualizarProductosSinProveedor(proveedorId: string) {
    if (!this.usuarioId) return;

    try {
      const productosRef = collection(this.firestore, 'productos');
      const q = query(
        productosRef,
        where('userId', '==', this.usuarioId),
        where('proveedorId', '==', proveedorId)
      );
      const snapshot = await getDocs(q);

      const actualizaciones = snapshot.docs.map(docRef => {
        return updateDoc(doc(this.firestore, 'productos', docRef.id), {
          proveedorId: null
        });
      });

      await Promise.all(actualizaciones);
    } catch (error) {
      console.error('Error al actualizar productos:', error);
      throw error;
    }
  }

  async mostrarToast(mensaje: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 3000,
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

  // Volver atrás
  volverAtras() {
    this.router.navigate(['/home']);
  }
}
