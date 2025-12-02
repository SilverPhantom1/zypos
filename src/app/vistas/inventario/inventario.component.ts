import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption, ToastController } from '@ionic/angular/standalone';
import { arrowBack, add, save, camera, image, close } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, collection, addDoc, getDocs, query, where } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-inventario',
  templateUrl: './inventario.component.html',
  styleUrls: ['./inventario.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption, CommonModule, ReactiveFormsModule]
})
export class InventarioComponent implements OnInit {
  verificandoAuth: boolean = true;
  usuarioId: string | null = null;
  mostrandoFormulario: boolean = false;
  estaCargando: boolean = false;
  estaCargandoCategorias: boolean = false;
  estaCargandoProveedores: boolean = false;
  
  // Listas de categorías y proveedores
  categorias: any[] = [];
  proveedores: any[] = [];
  
  // Foto del producto
  fotoSeleccionada: string | null = null;
  archivoFoto: File | null = null;
  estaSubiendoFoto: boolean = false;
  
  // Formulario de producto
  formularioProducto!: FormGroup;

  constructor(
    private auth: Auth,
    private router: Router,
    private firestore: Firestore,
    private storage: Storage,
    private formBuilder: FormBuilder,
    private toastController: ToastController
  ) {
    addIcons({ arrowBack, add, save, camera, image, close });
  }

  async ngOnInit() {
    // Esperar a que Firebase Auth se inicialice completamente (importante después de refresh)
    // onAuthStateChanged se ejecuta cuando Firebase Auth termina de inicializarse
    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        // Si no hay usuario después de la inicialización, redirigir
        this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      } else {
        // Si hay usuario, permitir acceso
        if (user.uid !== this.usuarioId) {
          this.usuarioId = user.uid;
          this.verificandoAuth = false;
          
          // Inicializar formulario
          this.inicializarFormulario();
          
          // Cargar categorías y proveedores
          await this.cargarCategorias();
          await this.cargarProveedores();
        }
      }
    });
  }

  inicializarFormulario() {
    this.formularioProducto = this.formBuilder.group({
      nombre: ['', [Validators.required]],
      descripcion: [''],
      precio: ['', [Validators.required, this.validarPrecioPositivo]],
      stock: ['', [Validators.required, this.validarStockNoNegativo]],
      codigoBarras: [''],
      categoriaId: ['ninguna'],
      proveedorId: ['ninguna'],
      estado: ['buen estado', [Validators.required]]
    });
  }

  // Validador personalizado para precio positivo
  validarPrecioPositivo(control: any) {
    const valor = control.value;
    if (!valor && valor !== 0) {
      return null; // Si está vacío, el validador required se encargará
    }
    const precio = parseFloat(valor);
    if (isNaN(precio) || precio <= 0) {
      return { precioInvalido: true };
    }
    return null;
  }

  // Validador personalizado para stock no negativo
  validarStockNoNegativo(control: any) {
    const valor = control.value;
    if (!valor && valor !== 0) {
      return null; // Si está vacío, el validador required se encargará
    }
    const stock = parseFloat(valor);
    if (isNaN(stock) || stock < 0) {
      return { stockInvalido: true };
    }
    return null;
  }

  // Cargar categorías del usuario (y categorías predeterminadas)
  async cargarCategorias() {
    if (!this.usuarioId) return;
    
    this.estaCargandoCategorias = true;
    try {
      const categoriasRef = collection(this.firestore, 'categorias');
      
      // Cargar categorías del usuario
      const qUsuario = query(categoriasRef, where('userid', '==', this.usuarioId));
      const snapshotUsuario = await getDocs(qUsuario);
      const categoriasUsuario = snapshotUsuario.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Cargar categorías predeterminadas (userid == null o no existe)
      const qPredeterminadas = query(categoriasRef, where('userid', '==', null));
      const snapshotPredeterminadas = await getDocs(qPredeterminadas);
      const categoriasPredeterminadas = snapshotPredeterminadas.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Combinar ambas listas
      this.categorias = [...categoriasUsuario, ...categoriasPredeterminadas];
    } catch (error: any) {
      // Silenciar el error si es por permisos o colección inexistente (esperado por ahora)
      // Solo log en consola para desarrollo, no mostrar toast al usuario
      if (error.code !== 'permission-denied' && error.code !== 'missing-or-insufficient-permissions') {
        console.error('Error al cargar categorías:', error);
      }
      // Inicializar como lista vacía si hay error
      this.categorias = [];
    } finally {
      this.estaCargandoCategorias = false;
    }
  }

  // Cargar proveedores del usuario
  async cargarProveedores() {
    if (!this.usuarioId) return;
    
    this.estaCargandoProveedores = true;
    try {
      const proveedoresRef = collection(this.firestore, 'proveedores');
      const q = query(proveedoresRef, where('userid', '==', this.usuarioId));
      const querySnapshot = await getDocs(q);
      
      this.proveedores = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error: any) {
      // Silenciar el error si es por permisos o colección inexistente (esperado por ahora)
      // Solo log en consola para desarrollo, no mostrar toast al usuario
      if (error.code !== 'permission-denied' && error.code !== 'missing-or-insufficient-permissions') {
        console.error('Error al cargar proveedores:', error);
      }
      // Inicializar como lista vacía si hay error
      this.proveedores = [];
    } finally {
      this.estaCargandoProveedores = false;
    }
  }

  // Generar código de barras único
  generarCodigoBarras(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `ZY${timestamp}${random}`;
  }

  // Seleccionar/tomar foto
  async seleccionarFoto() {
    // Si está en web, usar input file nativo
    if (Capacitor.getPlatform() === 'web') {
      this.seleccionarFotoWeb();
      return;
    }

    // Si está en móvil, usar Capacitor Camera
    try {
      const imagen = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt // Permite elegir entre cámara o galería
      });

      if (imagen.dataUrl) {
        this.fotoSeleccionada = imagen.dataUrl;
        
        // Convertir dataUrl a File para subir a Storage
        const respuesta = await fetch(imagen.dataUrl);
        const blob = await respuesta.blob();
        const nombreArchivo = `producto_${Date.now()}.${imagen.format || 'jpg'}`;
        this.archivoFoto = new File([blob], nombreArchivo, { type: blob.type });
      }
    } catch (error: any) {
      // Si el usuario cancela, no mostrar error
      if (error.message !== 'User cancelled photos app' && !error.message?.includes('cancel')) {
        console.error('Error al seleccionar foto:', error);
        this.mostrarToast('Error al seleccionar la foto', 'danger');
      }
    }
  }

  // Seleccionar foto en web usando input file nativo
  seleccionarFotoWeb() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Preferir cámara trasera en móviles
    
    input.onchange = async (event: any) => {
      const archivo = event.target.files?.[0];
      if (!archivo) return;

      // Validar que sea una imagen
      if (!archivo.type.startsWith('image/')) {
        this.mostrarToast('Por favor selecciona un archivo de imagen', 'danger');
        return;
      }

      // Validar tamaño (máximo 5MB)
      if (archivo.size > 5 * 1024 * 1024) {
        this.mostrarToast('La imagen es muy grande. Máximo 5MB', 'danger');
        return;
      }

      try {
        // Leer archivo como data URL para preview
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.fotoSeleccionada = e.target.result;
        };
        reader.readAsDataURL(archivo);
        
        // Guardar el archivo
        this.archivoFoto = archivo;
      } catch (error) {
        console.error('Error al leer la imagen:', error);
        this.mostrarToast('Error al procesar la imagen', 'danger');
      }
    };

    // Simular click en el input
    input.click();
  }

  // Eliminar foto seleccionada
  eliminarFoto() {
    this.fotoSeleccionada = null;
    this.archivoFoto = null;
  }

  // Obtener texto de la categoría seleccionada
  obtenerTextoCategoria(): string {
    const categoriaId = this.formularioProducto.get('categoriaId')?.value;
    if (!categoriaId || categoriaId === 'ninguna') {
      return 'Sin categoría';
    }
    const categoria = this.categorias.find(c => c.id === categoriaId);
    return categoria?.nombre || 'Categoría seleccionada';
  }

  // Obtener texto del proveedor seleccionado
  obtenerTextoProveedor(): string {
    const proveedorId = this.formularioProducto.get('proveedorId')?.value;
    if (!proveedorId || proveedorId === 'ninguna') {
      return 'Sin proveedor';
    }
    const proveedor = this.proveedores.find(p => p.id === proveedorId);
    return proveedor?.nombre || 'Proveedor seleccionado';
  }

  // Obtener texto del estado seleccionado
  obtenerTextoEstado(): string {
    const estado = this.formularioProducto.get('estado')?.value;
    if (estado === 'buen estado') {
      return 'Buen Estado';
    }
    if (estado === 'mal estado') {
      return 'Mal Estado';
    }
    return '';
  }

  // Subir foto a Firebase Storage
  async subirFotoAStorage(): Promise<string | null> {
    if (!this.archivoFoto || !this.usuarioId) {
      return null;
    }

    this.estaSubiendoFoto = true;
    try {
      // Limpiar nombre de archivo (remover espacios y caracteres especiales)
      const nombreLimpio = this.archivoFoto.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const nombreArchivo = `productos/${this.usuarioId}/${Date.now()}_${nombreLimpio}`;
      const storageRef = ref(this.storage, nombreArchivo);
      
      // Subir archivo (File ya es compatible con uploadBytes)
      await uploadBytes(storageRef, this.archivoFoto);
      
      // Obtener URL de descarga
      const url = await getDownloadURL(storageRef);
      return url;
    } catch (error: any) {
      console.error('Error al subir foto:', error);
      
      // Mensajes de error más específicos
      let mensajeError = 'Error al subir la foto';
      if (error.code === 'storage/unauthorized') {
        mensajeError = 'No tienes permisos para subir fotos. Verifica las reglas de Storage.';
      } else if (error.code === 'storage/canceled') {
        mensajeError = 'La subida fue cancelada';
      } else if (error.message?.includes('CORS') || error.message?.includes('network')) {
        mensajeError = 'Error de conexión. Verifica las reglas de Firebase Storage.';
      }
      
      this.mostrarToast(mensajeError, 'danger');
      return null;
    } finally {
      this.estaSubiendoFoto = false;
    }
  }

  // Mostrar/ocultar formulario
  toggleFormulario() {
    this.mostrandoFormulario = !this.mostrandoFormulario;
    if (!this.mostrandoFormulario) {
      this.formularioProducto.reset({
        estado: 'buen estado',
        categoriaId: 'ninguna',
        proveedorId: 'ninguna'
      });
      this.fotoSeleccionada = null;
      this.archivoFoto = null;
    }
  }

  // Guardar producto
  async guardarProducto() {
    if (this.formularioProducto.invalid || !this.usuarioId) {
      // Marcar todos los campos como tocados para mostrar errores
      Object.keys(this.formularioProducto.controls).forEach(key => {
        this.formularioProducto.get(key)?.markAsTouched();
      });
      return;
    }

    this.estaCargando = true;

    try {
      const valores = this.formularioProducto.value;
      
      // Generar código de barras si no se proporcionó uno
      let codigoBarras = valores.codigoBarras?.trim() || '';
      if (!codigoBarras) {
        codigoBarras = this.generarCodigoBarras();
      }

      // Subir foto si existe (solo si Storage está disponible)
      let fotoUrl: string | null = null;
      if (this.archivoFoto) {
        try {
          fotoUrl = await this.subirFotoAStorage();
          // Si falla la subida, continuar sin foto (no bloquear el guardado)
          if (!fotoUrl) {
            console.warn('No se pudo subir la foto, pero se guardará el producto sin foto');
            // No retornar, continuar con el guardado del producto
          }
        } catch (error) {
          console.error('Error al subir foto, continuando sin foto:', error);
          // Continuar sin foto
        }
      }

      // Preparar datos del producto
      const datosProducto: any = {
        nombre: valores.nombre.trim(),
        descripcion: valores.descripcion?.trim() || '',
        precio: parseFloat(valores.precio),
        stock: parseFloat(valores.stock),
        codigoBarras: codigoBarras,
        estado: valores.estado,
        userId: this.usuarioId
      };

      // Agregar foto si existe
      if (fotoUrl) {
        datosProducto.fotoUrl = fotoUrl;
      }

      // Agregar campos opcionales solo si tienen valor (y no es la opción "ninguna")
      if (valores.categoriaId && valores.categoriaId !== 'ninguna') {
        datosProducto.categoriaId = valores.categoriaId;
      }
      if (valores.proveedorId && valores.proveedorId !== 'ninguna') {
        datosProducto.proveedorId = valores.proveedorId;
      }

      // Guardar en Firestore
      await addDoc(collection(this.firestore, 'productos'), datosProducto);

      // Mostrar mensaje de éxito
      await this.mostrarToast('Producto creado exitosamente', 'success');

      // Limpiar formulario y ocultar
      this.formularioProducto.reset({
        estado: 'buen estado',
        categoriaId: 'ninguna',
        proveedorId: 'ninguna'
      });
      this.fotoSeleccionada = null;
      this.archivoFoto = null;
      this.mostrandoFormulario = false;

    } catch (error: any) {
      console.error('Error al crear producto:', error);
      await this.mostrarToast('Error al crear el producto. Por favor, intenta nuevamente.', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  // Mostrar toast
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

  // Volver al home
  volverAtras() {
    this.router.navigate(['/home'], { replaceUrl: true });
  }
}
