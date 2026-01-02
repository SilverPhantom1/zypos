import { Component, OnInit, AfterViewChecked, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption, ToastController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge, IonSearchbar, IonModal, IonButtons, IonTitle, IonGrid, IonRow, IonCol, ActionSheetController, AlertController } from '@ionic/angular/standalone';
import { arrowBack, add, save, camera, image, close, create, trash, warning, checkmarkCircle, barcode, list, grid, search, filter, swapVertical, pricetags, addCircle, checkmark, storefront } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, orderBy } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CloudinaryService } from '../../servicios/cloudinary.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { BrowserMultiFormatReader } from '@zxing/library';
import JsBarcode from 'jsbarcode';

@Component({
  selector: 'app-inventario',
  templateUrl: './inventario.component.html',
  styleUrls: ['./inventario.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption, CommonModule, ReactiveFormsModule, FormsModule, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge, IonSearchbar, IonModal, IonButtons, IonTitle, IonGrid, IonRow, IonCol, RouterLink]
})
export class InventarioComponent implements OnInit, AfterViewChecked, AfterViewInit {
  verificandoAuth: boolean = true;
  usuarioId: string | null = null;
  mostrandoFormulario: boolean = false;
  estaCargando: boolean = false;
  estaCargandoCategorias: boolean = false;
  estaCargandoProveedores: boolean = false;
  
  categorias: any[] = [];
  proveedores: any[] = [];
  
  fotoSeleccionada: string | null = null;
  archivoFoto: File | null = null;
  estaSubiendoFoto: boolean = false;
  
  formularioProducto!: FormGroup;
  
  productos: any[] = [];
  productosFiltrados: any[] = [];
  estaCargandoProductos: boolean = false;
  
  terminoBusqueda: string = '';
  categoriaFiltro: string = 'todas';
  proveedorFiltro: string = 'todos';
  ordenamiento: string = 'nombre';
  vistaGrid: boolean = true;
  umbralBajoStock: number = 10;
  
  mostrandoModalEditar: boolean = false;
  mostrandoModalAjusteStock: boolean = false;
  mostrandoModalCategorias: boolean = false;
  productoEditando: any = null;
  productoAjustandoStock: any = null;
  nuevoStock: number = 0;
  
  esPlataformaMovil: boolean = false;
  
  mostrandoMenuContextual: boolean = false;
  productoSeleccionado: any = null;
  posicionMenu: { x: number, y: number } = { x: 0, y: 0 };
  
  formularioEdicion!: FormGroup;
  
  formularioCategoria!: FormGroup;
  categoriaEditando: any = null;
  estaCargandoCategoria: boolean = false;
  
  // Para pistola lectora
  procesandoCodigo: boolean = false;
  ultimaBusqueda: string = '';
  tiempoUltimaBusqueda: number = 0;
  tiempoInicioEscritura: number = 0;
  timeoutProcesarCodigo: any = null;

  constructor(
    private auth: Auth,
    private router: Router,
    private firestore: Firestore,
    private cloudinaryService: CloudinaryService,
    private formBuilder: FormBuilder,
    private toastController: ToastController,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController
  ) {
    addIcons({ arrowBack, add, save, camera, image, close, create, trash, warning, checkmarkCircle, barcode, list, grid, search, filter, swapVertical, pricetags, addCircle, checkmark, storefront });
  }

  async ngOnInit() {
    this.esPlataformaMovil = Capacitor.getPlatform() !== 'web';
    
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
          this.inicializarFormulario();
          this.inicializarFormularioCategoria();
          await this.cargarCategorias();
          await this.cargarProveedores();
          await this.cargarProductos();
        }
      }
    });
  }

  @ViewChild('searchbar', { static: false }) searchbar!: any;

  ngAfterViewInit() {
    // Exponer función de prueba en la consola para desarrollo
    if (typeof window !== 'undefined') {
      (window as any).simularEscaneoPistola = (codigo: string) => {
        this.terminoBusqueda = codigo;
        this.procesarCodigoBarras(codigo);
      };
      console.log('💡 Modo de prueba activado. Usa: simularEscaneoPistola("1234567890123") en la consola');
    }
    
    // Agregar listener directo al input del searchbar para capturar Enter
    setTimeout(() => {
      if (this.searchbar && this.searchbar.el) {
        const inputElement = this.searchbar.el.querySelector('input');
        if (inputElement) {
          inputElement.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
              this.onBuscarKeyDown(event);
            }
          });
        }
      }
    }, 500);
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

  inicializarFormularioCategoria() {
    this.formularioCategoria = this.formBuilder.group({
      nombre: ['', [Validators.required]]
    });
  }

  validarPrecioPositivo(control: any) {
    const valor = control.value;
    if (!valor && valor !== 0) {
      return null;
    }
    const precio = parseFloat(valor);
    if (isNaN(precio) || precio <= 0) {
      return { precioInvalido: true };
    }
    return null;
  }

  validarStockNoNegativo(control: any) {
    const valor = control.value;
    if (!valor && valor !== 0) {
      return null;
    }
    const stock = parseFloat(valor);
    if (isNaN(stock) || stock < 0) {
      return { stockInvalido: true };
    }
    return null;
  }

  async cargarCategorias() {
    if (!this.usuarioId) {
      console.warn('No hay usuarioId, no se pueden cargar categorías');
      this.categorias = [];
      return;
    }
    
    this.estaCargandoCategorias = true;
    
    const categoriasUsuario: any[] = [];
    const categoriasPredeterminadas: any[] = [];
    
    try {
      const categoriasRef = collection(this.firestore, 'categorias');
      
      try {
        const qUsuario = query(categoriasRef, where('userId', '==', this.usuarioId));
        const snapshotUsuario = await getDocs(qUsuario);
        
        snapshotUsuario.docs.forEach(doc => {
          const data = doc.data();
          categoriasUsuario.push({
            id: doc.id,
            nombre: data['nombre'] || '',
            userId: data['userId']
          });
        });
      } catch (errorUsuario: any) {
        console.error('Error al cargar categorías del usuario:', errorUsuario);
      }
      
      try {
        const qPredeterminadas = query(categoriasRef, where('userId', '==', null));
        const snapshotPredeterminadas = await getDocs(qPredeterminadas);
        
        snapshotPredeterminadas.docs.forEach(doc => {
          const data = doc.data();
          categoriasPredeterminadas.push({
            id: doc.id,
            nombre: data['nombre'] || '',
            userId: null
          });
        });
      } catch (errorPredeterminadas: any) {
        console.error('Error al cargar categorías predeterminadas:', errorPredeterminadas);
      }
      
      this.categorias = [...categoriasUsuario, ...categoriasPredeterminadas];
      
    } catch (error: any) {
      if (categoriasUsuario.length > 0 || categoriasPredeterminadas.length > 0) {
        this.categorias = [...categoriasUsuario, ...categoriasPredeterminadas];
      } else {
        this.categorias = [];
      }
      
      if (error.code === 'permission-denied' || error.code === 'missing-or-insufficient-permissions') {
        this.mostrarToast('Error de permisos. Verifica las reglas de Firestore para "categorias".', 'danger');
      }
    } finally {
      this.estaCargandoCategorias = false;
    }
  }

  async cargarProveedores() {
    if (!this.usuarioId) return;
    
    this.estaCargandoProveedores = true;
    try {
      const proveedoresRef = collection(this.firestore, 'proveedores');
      const q = query(proveedoresRef, where('userId', '==', this.usuarioId));
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
      this.proveedores = [];
    } finally {
      this.estaCargandoProveedores = false;
    }
  }

  generarCodigoBarras(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `ZY${timestamp}${random}`;
  }

  async seleccionarFoto() {
    if (Capacitor.getPlatform() === 'web') {
      this.seleccionarFotoWeb();
      return;
    }

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
      if (error.message !== 'User cancelled photos app' && !error.message?.includes('cancel')) {
        console.error('Error al seleccionar foto:', error);
        this.mostrarToast('Error al seleccionar la foto', 'danger');
      }
    }
  }

  seleccionarFotoWeb() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Preferir cámara trasera en móviles
    
    input.onchange = async (event: any) => {
      const archivo = event.target.files?.[0];
      if (!archivo) return;

      if (!archivo.type.startsWith('image/')) {
        this.mostrarToast('Por favor selecciona un archivo de imagen', 'danger');
        return;
      }

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
        
        this.archivoFoto = archivo;
      } catch (error) {
        console.error('Error al leer la imagen:', error);
        this.mostrarToast('Error al procesar la imagen', 'danger');
      }
    };

    // Simular click en el input
    input.click();
  }

  eliminarFoto() {
    this.fotoSeleccionada = null;
    this.archivoFoto = null;
  }

  obtenerTextoCategoria(): string {
    const categoriaId = this.formularioProducto.get('categoriaId')?.value;
    if (!categoriaId || categoriaId === 'ninguna') {
      return 'Sin categoría';
    }
    const categoria = this.categorias.find(c => c.id === categoriaId);
    return categoria?.nombre || 'Categoría seleccionada';
  }

  obtenerTextoProveedor(): string {
    const proveedorId = this.formularioProducto.get('proveedorId')?.value;
    if (!proveedorId || proveedorId === 'ninguna') {
      return 'Sin proveedor';
    }
    const proveedor = this.proveedores.find(p => p.id === proveedorId);
    return proveedor?.nombre || 'Proveedor seleccionado';
  }

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

  async subirFotoAStorage(): Promise<string | null> {
    if (!this.archivoFoto || !this.usuarioId) {
      console.warn('No hay archivo de foto o usuarioId para subir');
      return null;
    }

    this.estaSubiendoFoto = true;
    console.log('Iniciando subida de foto a Cloudinary...', {
      archivo: this.archivoFoto.name,
      tamaño: this.archivoFoto.size,
      tipo: this.archivoFoto.type
    });

    try {
      const url = await this.cloudinaryService.subirImagen(
        this.archivoFoto,
        'zypos/productos',
        this.usuarioId
      );
      console.log('Foto subida exitosamente a Cloudinary:', url);
      this.mostrarToast('Foto subida correctamente', 'success');
      return url;
    } catch (error: any) {
      console.error('Error al subir foto a Cloudinary:', error);
      
      let mensajeError = 'Error al subir la foto';
      if (error.message?.includes('Cloudinary no está configurado')) {
        mensajeError = 'El servicio de imágenes no está configurado. Contacta al administrador.';
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        mensajeError = 'Error de conexión. Verifica tu conexión a internet.';
      } else {
        mensajeError = error.message || 'Error al subir la foto';
      }
      
      this.mostrarToast(mensajeError, 'danger');
      return null;
    } finally {
      this.estaSubiendoFoto = false;
    }
  }

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

  async guardarProducto() {
    if (this.formularioProducto.invalid || !this.usuarioId) {
      Object.keys(this.formularioProducto.controls).forEach(key => {
        this.formularioProducto.get(key)?.markAsTouched();
      });
      return;
    }

    this.estaCargando = true;

    try {
      const valores = this.formularioProducto.value;
      
      let codigoBarras = valores.codigoBarras?.trim() || '';
      if (!codigoBarras) {
        codigoBarras = this.generarCodigoBarras();
      }

      let fotoUrl: string | null = null;
      if (this.archivoFoto) {
        try {
          console.log('Intentando subir foto antes de guardar producto...');
          fotoUrl = await this.subirFotoAStorage();
          if (!fotoUrl) {
            console.warn('No se pudo subir la foto, pero se guardará el producto sin foto');
            this.mostrarToast('El producto se guardó pero sin foto', 'warning');
          } else {
            console.log('Foto URL obtenida:', fotoUrl);
          }
        } catch (error) {
          console.error('Error al subir foto, continuando sin foto:', error);
          this.mostrarToast('Error al subir la foto. El producto se guardará sin foto.', 'warning');
        }
      } else {
        console.log('No hay archivo de foto para subir');
      }

      const datosProducto: any = {
        nombre: valores.nombre.trim(),
        descripcion: valores.descripcion?.trim() || '',
        precio: parseFloat(valores.precio),
        stock: parseFloat(valores.stock),
        codigoBarras: codigoBarras,
        estado: valores.estado,
        userId: this.usuarioId
      };

      if (fotoUrl) {
        datosProducto.fotoUrl = fotoUrl;
        console.log('Agregando fotoUrl al producto:', fotoUrl);
      } else {
        console.log('No se agregó fotoUrl al producto');
      }

      console.log('Datos del producto a guardar:', datosProducto);

      if (valores.categoriaId && valores.categoriaId !== 'ninguna') {
        datosProducto.categoriaId = valores.categoriaId;
      }
      if (valores.proveedorId && valores.proveedorId !== 'ninguna') {
        datosProducto.proveedorId = valores.proveedorId;
      }

      await addDoc(collection(this.firestore, 'productos'), datosProducto);

      await this.mostrarToast('Producto creado exitosamente', 'success');

      this.formularioProducto.reset({
        estado: 'buen estado',
        categoriaId: 'ninguna',
        proveedorId: 'ninguna'
      });
      this.fotoSeleccionada = null;
      this.archivoFoto = null;
      this.mostrandoFormulario = false;

      await this.cargarProductos();

    } catch (error: any) {
      console.error('Error al crear producto:', error);
      await this.mostrarToast('Error al crear el producto. Por favor, intenta nuevamente.', 'danger');
    } finally {
      this.estaCargando = false;
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

  // Volver al home
  volverAtras() {
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  async cargarProductos() {
    if (!this.usuarioId) return;
    
    this.estaCargandoProductos = true;
    try {
      const productosRef = collection(this.firestore, 'productos');
      const q = query(productosRef, where('userId', '==', this.usuarioId));
      const querySnapshot = await getDocs(q);
      
      this.productos = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Aplicar filtros y ordenamiento
      this.aplicarFiltrosYOrdenamiento();
      
      setTimeout(() => {
        this.generarCodigosBarras();
      }, 100);
    } catch (error: any) {
      console.error('Error al cargar productos:', error);
      this.mostrarToast('Error al cargar los productos', 'danger');
      this.productos = [];
    } finally {
      this.estaCargandoProductos = false;
    }
  }

  // Aplicar filtros y ordenamiento
  aplicarFiltrosYOrdenamiento() {
    let productosFiltrados = [...this.productos];
    
    // Filtro por búsqueda
    if (this.terminoBusqueda.trim()) {
      const busqueda = this.terminoBusqueda.toLowerCase().trim();
      productosFiltrados = productosFiltrados.filter(producto => {
        const nombre = (producto.nombre || '').toLowerCase();
        const descripcion = (producto.descripcion || '').toLowerCase();
        const codigoBarras = (producto.codigoBarras || '').toLowerCase();
        const categoriaNombre = this.obtenerNombreCategoria(producto.categoriaId)?.toLowerCase() || '';
        
        return nombre.includes(busqueda) ||
               descripcion.includes(busqueda) ||
               codigoBarras.includes(busqueda) ||
               categoriaNombre.includes(busqueda);
      });
    }
    
    // Filtro por categoría
    if (this.categoriaFiltro !== 'todas') {
      productosFiltrados = productosFiltrados.filter(producto => {
        if (this.categoriaFiltro === 'sin-categoria') {
          return !producto.categoriaId || producto.categoriaId === 'ninguna';
        }
        return producto.categoriaId === this.categoriaFiltro;
      });
    }
    
    // Filtro por proveedor
    if (this.proveedorFiltro !== 'todos') {
      productosFiltrados = productosFiltrados.filter(producto => {
        if (this.proveedorFiltro === 'sin-proveedor') {
          return !producto.proveedorId || producto.proveedorId === 'ninguna';
        }
        return producto.proveedorId === this.proveedorFiltro;
      });
    }
    
    // Ordenamiento
    productosFiltrados.sort((a, b) => {
      switch (this.ordenamiento) {
        case 'nombre':
          return (a.nombre || '').localeCompare(b.nombre || '');
        case 'precio':
          return (a.precio || 0) - (b.precio || 0);
        case 'stock':
          return (a.stock || 0) - (b.stock || 0);
        default:
          return 0;
      }
    });
    
    this.productosFiltrados = productosFiltrados;
    
    setTimeout(() => {
      this.generarCodigosBarras();
    }, 100);
  }

  obtenerNombreCategoria(categoriaId: string | null | undefined): string {
    if (!categoriaId) return 'Sin categoría';
    const categoria = this.categorias.find(c => c.id === categoriaId);
    return categoria?.nombre || 'Sin categoría';
  }

  tieneCategoriaValida(categoriaId: string | null | undefined): boolean {
    if (!categoriaId) return false;
    return this.categorias.some(c => c.id === categoriaId);
  }

  cambiarVista() {
    this.vistaGrid = !this.vistaGrid;
  }

  cambiarOrdenamiento() {
    const opciones = ['nombre', 'precio', 'stock'];
    const indiceActual = opciones.indexOf(this.ordenamiento);
    const siguienteIndice = (indiceActual + 1) % opciones.length;
    this.ordenamiento = opciones[siguienteIndice];
    this.aplicarFiltrosYOrdenamiento();
  }

  obtenerEstadoStock(stock: number): 'normal' | 'bajo' | 'sin-stock' {
    if (stock === 0) return 'sin-stock';
    if (stock <= this.umbralBajoStock) return 'bajo';
    return 'normal';
  }

  // Formatear precio en pesos chilenos (CLP)
  formatearPrecio(precio: number): string {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(precio);
  }

  // Abrir modal de edición
  abrirModalEditar(producto: any) {
    this.productoEditando = { ...producto };
    this.inicializarFormularioEdicion();
    this.mostrandoModalEditar = true;
  }

  cerrarModalEditar() {
    this.mostrandoModalEditar = false;
    this.productoEditando = null;
    this.fotoSeleccionada = null;
    this.archivoFoto = null;
  }

  inicializarFormularioEdicion() {
    if (!this.productoEditando) return;
    
    this.formularioEdicion = this.formBuilder.group({
      nombre: [this.productoEditando.nombre || '', [Validators.required]],
      descripcion: [this.productoEditando.descripcion || ''],
      precio: [this.productoEditando.precio || '', [Validators.required, this.validarPrecioPositivo]],
      stock: [this.productoEditando.stock || '', [Validators.required, this.validarStockNoNegativo]],
      codigoBarras: [this.productoEditando.codigoBarras || ''],
      categoriaId: [this.productoEditando.categoriaId || 'ninguna'],
      proveedorId: [this.productoEditando.proveedorId || 'ninguna'],
      estado: [this.productoEditando.estado || 'buen estado', [Validators.required]]
    });
    
    if (this.productoEditando.fotoUrl) {
      this.fotoSeleccionada = this.productoEditando.fotoUrl;
    }
  }

  async guardarEdicion() {
    if (this.formularioEdicion.invalid || !this.productoEditando || !this.usuarioId) {
      Object.keys(this.formularioEdicion.controls).forEach(key => {
        this.formularioEdicion.get(key)?.markAsTouched();
      });
      return;
    }

    this.estaCargando = true;

    try {
      const valores = this.formularioEdicion.value;
      
      let fotoUrl: string | null = this.productoEditando.fotoUrl || null;
      if (this.archivoFoto) {
        // Nota: Las imágenes anteriores en Cloudinary se mantienen por seguridad
        // Se pueden eliminar manualmente desde el dashboard de Cloudinary si es necesario
        fotoUrl = await this.subirFotoAStorage();
      }

      const datosActualizados: any = {
        nombre: valores.nombre.trim(),
        descripcion: valores.descripcion?.trim() || '',
        precio: parseFloat(valores.precio),
        stock: parseFloat(valores.stock),
        codigoBarras: valores.codigoBarras?.trim() || this.productoEditando.codigoBarras,
        estado: valores.estado
      };

      if (fotoUrl) {
        datosActualizados.fotoUrl = fotoUrl;
      }

      if (valores.categoriaId && valores.categoriaId !== 'ninguna') {
        datosActualizados.categoriaId = valores.categoriaId;
      } else {
        datosActualizados.categoriaId = null;
      }
      
      if (valores.proveedorId && valores.proveedorId !== 'ninguna') {
        datosActualizados.proveedorId = valores.proveedorId;
      } else {
        datosActualizados.proveedorId = null;
      }

      const productoRef = doc(this.firestore, 'productos', this.productoEditando.id);
      await updateDoc(productoRef, datosActualizados);

      await this.mostrarToast('Producto actualizado exitosamente', 'success');
      await this.cargarProductos();
      this.cerrarModalEditar();

    } catch (error: any) {
      console.error('Error al actualizar producto:', error);
      await this.mostrarToast('Error al actualizar el producto. Por favor, intenta nuevamente.', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  async mostrarOpcionesProducto(producto: any, event?: MouseEvent) {
    if (this.esPlataformaMovil) {
      // En móvil: usar ActionSheet
      const actionSheet = await this.actionSheetController.create({
        header: producto.nombre,
        buttons: [
          {
            text: 'Editar',
            icon: 'create',
            handler: () => {
              this.abrirModalEditar(producto);
            }
          },
          {
            text: 'Ajustar Stock',
            icon: 'swap-vertical',
            handler: () => {
              this.abrirModalAjusteStock(producto);
            }
          },
          {
            text: 'Eliminar',
            icon: 'trash',
            role: 'destructive',
            handler: () => {
              this.confirmarEliminacion(producto);
            }
          },
          {
            text: 'Cancelar',
            icon: 'close',
            role: 'cancel'
          }
        ]
      });

      await actionSheet.present();
    } else {
      // En web: mostrar menú contextual
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        
        const menuWidth = 220;
        const menuHeight = 200;
        let x = event.clientX;
        let y = event.clientY;
        
        // Ajustar horizontalmente
        if (x + menuWidth > window.innerWidth) {
          x = window.innerWidth - menuWidth - 10;
        }
        if (x < 10) {
          x = 10;
        }
        
        // Ajustar verticalmente
        if (y + menuHeight > window.innerHeight) {
          y = window.innerHeight - menuHeight - 10;
        }
        if (y < 10) {
          y = 10;
        }
        
        this.posicionMenu = { x, y };
      } else {
        this.posicionMenu = { 
          x: window.innerWidth / 2 - 110, 
          y: window.innerHeight / 2 - 100 
        };
      }
      
      this.productoSeleccionado = producto;
      this.mostrandoMenuContextual = true;
    }
  }

  cerrarMenuContextual() {
    this.mostrandoMenuContextual = false;
    this.productoSeleccionado = null;
  }

  // Ejecutar acción desde menú contextual
  ejecutarAccion(accion: string) {
    if (!this.productoSeleccionado) return;
    
    const producto = { ...this.productoSeleccionado };
    this.cerrarMenuContextual();
    
    setTimeout(() => {
      switch (accion) {
        case 'editar':
          this.abrirModalEditar(producto);
          break;
        case 'ajustar-stock':
          this.abrirModalAjusteStock(producto);
          break;
        case 'eliminar':
          this.confirmarEliminacion(producto);
          break;
      }
    }, 100);
  }

  // Confirmar eliminación
  async confirmarEliminacion(producto: any) {
    const alert = await this.alertController.create({
      header: 'Confirmar eliminación',
      message: `¿Estás seguro de eliminar el producto "${producto.nombre}"? Esta acción no se puede deshacer.`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            this.eliminarProducto(producto);
          }
        }
      ]
    });

    await alert.present();
  }

  async eliminarProducto(producto: any) {
    if (!producto.id || !this.usuarioId) return;

    this.estaCargando = true;

    try {
      // Nota: Las imágenes en Cloudinary se mantienen al eliminar el producto
      // Se pueden eliminar manualmente desde el dashboard de Cloudinary si es necesario

      const productoRef = doc(this.firestore, 'productos', producto.id);
      await deleteDoc(productoRef);

      await this.mostrarToast('Producto eliminado exitosamente', 'success');

      await this.cargarProductos();

    } catch (error: any) {
      console.error('Error al eliminar producto:', error);
      await this.mostrarToast('Error al eliminar el producto. Por favor, intenta nuevamente.', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  onBuscar(event: any) {
    const valor = event.detail.value || '';
    this.terminoBusqueda = valor;
    
    // Detectar si es un escaneo rápido (pistola lectora)
    // Las pistolas lectoras normalmente escanean muy rápido (menos de 300ms)
    const ahora = Date.now();
    
    if (this.tiempoInicioEscritura === 0) {
      this.tiempoInicioEscritura = ahora;
    }
    
    const tiempoTranscurrido = ahora - this.tiempoInicioEscritura;
    
    // Limpiar timeout anterior si existe
    if (this.timeoutProcesarCodigo) {
      clearTimeout(this.timeoutProcesarCodigo);
    }
    
    // Si el texto es largo (más de 8 caracteres) y se escribió muy rápido, probablemente es un escaneo
    // Esperamos 500ms después de que el usuario deje de escribir para procesar
    if (valor.length >= 8) {
      this.timeoutProcesarCodigo = setTimeout(async () => {
        // Si el texto parece un código de barras (alfanumérico, longitud típica)
        // o si se escribió muy rápido (menos de 500ms), procesarlo como código
        const tiempoTotal = Date.now() - this.tiempoInicioEscritura;
        const esEscaneoRapido = tiempoTotal < 500 && valor.length >= 8;
        const pareceCodigoBarras = /^[A-Z0-9]{8,}$/i.test(valor.trim());
        
        if (esEscaneoRapido || pareceCodigoBarras) {
          await this.procesarCodigoBarras(valor.trim());
        }
        
        // Resetear contadores
        this.tiempoInicioEscritura = 0;
        this.timeoutProcesarCodigo = null;
      }, 500);
    } else {
      // Si el texto es corto, resetear el contador
      this.tiempoInicioEscritura = 0;
    }
    
    this.ultimaBusqueda = valor;
    this.tiempoUltimaBusqueda = ahora;
    this.aplicarFiltrosYOrdenamiento();
  }

  // Detectar Enter en el buscador para procesar códigos de barras
  async onBuscarKeyDown(event: KeyboardEvent | any) {
    // Manejar tanto KeyboardEvent como eventos de Angular
    const key = event.key || event.detail?.key || 'Enter';
    const codigo = this.terminoBusqueda.trim();
    
    if (key === 'Enter' && codigo) {
      if (event.preventDefault) {
        event.preventDefault();
      }
      if (event.stopPropagation) {
        event.stopPropagation();
      }
      
      // Limpiar timeout si existe
      if (this.timeoutProcesarCodigo) {
        clearTimeout(this.timeoutProcesarCodigo);
        this.timeoutProcesarCodigo = null;
      }
      
      // Verificar si parece un código de barras (alfanumérico, longitud típica)
      // Acepta códigos como "ZY17672968840145533" o códigos numéricos
      // Cualquier código de 8 o más caracteres alfanuméricos se considera código de barras
      if (/^[A-Z0-9]{8,}$/i.test(codigo)) {
        await this.procesarCodigoBarras(codigo);
        // Limpiar el buscador después de procesar
        this.terminoBusqueda = '';
        this.tiempoInicioEscritura = 0;
      }
      // Si no es un código de barras, dejar que se procese como búsqueda normal
    }
  }

  // Procesar código de barras escaneado (para pistola lectora o entrada manual)
  async procesarCodigoBarras(codigo: string) {
    if (!codigo || !codigo.trim() || this.procesandoCodigo) {
      return;
    }

    this.procesandoCodigo = true;
    const codigoLimpio = codigo.trim();
    
    // Limpiar el buscador inmediatamente para estar listo para el siguiente escaneo
    this.terminoBusqueda = '';

    try {
      // Buscar si el producto ya existe
      const productoExistente = this.productos.find(p => p.codigoBarras === codigoLimpio);

      if (productoExistente) {
        // Producto encontrado - mostrar opciones
        const alert = await this.alertController.create({
          header: 'Producto Encontrado',
          message: `El producto "${productoExistente.nombre}" ya está registrado con este código de barras.`,
          buttons: [
            {
              text: 'Agregar Stock',
              handler: () => {
                this.abrirModalAjusteStock(productoExistente);
              }
            },
            {
              text: 'Ver Detalles',
              handler: () => {
                this.mostrarOpcionesProducto(productoExistente);
              }
            },
            {
              text: 'Cancelar',
              role: 'cancel'
            }
          ]
        });
        await alert.present();
      } else {
        // Producto no encontrado - ofrecer crear nuevo
        const alert = await this.alertController.create({
          header: 'Producto No Encontrado',
          message: `No se encontró un producto con el código de barras: ${codigoLimpio}. ¿Deseas crear un nuevo producto con este código?`,
          buttons: [
            {
              text: 'Crear Producto',
              handler: () => {
                this.mostrandoFormulario = true;
                this.formularioProducto.patchValue({
                  codigoBarras: codigoLimpio
                });
                // Hacer scroll al formulario
                setTimeout(() => {
                  const formulario = document.querySelector('.contenedor-formulario');
                  if (formulario) {
                    formulario.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 100);
              }
            },
            {
              text: 'Cancelar',
              role: 'cancel'
            }
          ]
        });
        await alert.present();
      }
    } catch (error) {
      console.error('Error al procesar código de barras:', error);
      this.mostrarToast('Error al procesar el código de barras', 'danger');
    } finally {
      this.procesandoCodigo = false;
    }
  }

  // Escanear código de barras con cámara
  async escanearCodigoBarras() {
    try {
      // Usar la cámara para tomar foto
      const imagen = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });

      if (imagen.dataUrl) {
        const img = new Image();
        img.src = imagen.dataUrl;
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        // Usar ZXing para leer el código de barras
        const codeReader = new BrowserMultiFormatReader();
        
        try {
          const resultado = await codeReader.decodeFromImageElement(img);
          
            if (resultado && resultado.getText()) {
            const codigoBarras = resultado.getText();
            // Usar el método compartido para procesar el código
            await this.procesarCodigoBarras(codigoBarras);
          } else {
            this.mostrarToast('No se pudo leer el código de barras', 'warning');
          }
        } catch (decodeError) {
          console.error('Error al decodificar código de barras:', decodeError);
          this.mostrarToast('No se pudo leer el código de barras. Asegúrate de que la imagen contenga un código de barras válido.', 'warning');
        }
      }
    } catch (error: any) {
      if (error.message !== 'User cancelled photos app' && !error.message?.includes('cancel')) {
        console.error('Error al escanear código de barras:', error);
        this.mostrarToast('Error al escanear el código de barras', 'danger');
      }
    }
  }

  // Abrir modal de ajuste de stock
  abrirModalAjusteStock(producto: any) {
    this.productoAjustandoStock = producto;
    this.nuevoStock = producto.stock || 0;
    this.mostrandoModalAjusteStock = true;
  }

  cerrarModalAjusteStock() {
    this.mostrandoModalAjusteStock = false;
    this.productoAjustandoStock = null;
    this.nuevoStock = 0;
  }

  async guardarAjusteStock() {
    if (!this.productoAjustandoStock || !this.usuarioId) return;

    if (this.nuevoStock < 0) {
      this.mostrarToast('El stock no puede ser negativo', 'danger');
      return;
    }

    this.estaCargando = true;

    try {
      const productoRef = doc(this.firestore, 'productos', this.productoAjustandoStock.id);
      await updateDoc(productoRef, {
        stock: parseFloat(this.nuevoStock.toString())
      });

      await this.mostrarToast('Stock actualizado exitosamente', 'success');
      await this.cargarProductos();
      this.cerrarModalAjusteStock();

    } catch (error: any) {
      console.error('Error al actualizar stock:', error);
      await this.mostrarToast('Error al actualizar el stock. Por favor, intenta nuevamente.', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  async onProductoCreado() {
    await this.cargarProductos();
  }

  ngAfterViewChecked() {
    if (this.productosFiltrados.length > 0) {
      setTimeout(() => {
        this.generarCodigosBarras();
      }, 50);
    }
  }

  generarCodigosBarras() {
    this.productosFiltrados.forEach((producto, index) => {
      if (producto.codigoBarras) {
        const uniqueId = producto.id || `prod-${index}-${Date.now()}`;
        
        const svgId = `barcode-${uniqueId}`;
        const svgElement = document.getElementById(svgId);
        
        if (svgElement && !svgElement.hasAttribute('data-barcode-generated')) {
          try {
            svgElement.innerHTML = '';
            JsBarcode(svgElement, producto.codigoBarras, {
              format: "CODE128",
              width: 1.5,
              height: 40,
              displayValue: true,
              fontSize: 10,
              margin: 2,
              background: "transparent",
              lineColor: "#0a3254ff"
            });
            svgElement.setAttribute('data-barcode-generated', 'true');
          } catch (error) {
            console.error('Error al generar código de barras:', error);
          }
        }
        
        const svgIdLista = `barcode-lista-${uniqueId}`;
        const svgElementLista = document.getElementById(svgIdLista);
        
        if (svgElementLista && !svgElementLista.hasAttribute('data-barcode-generated')) {
          try {
            svgElementLista.innerHTML = '';
            JsBarcode(svgElementLista, producto.codigoBarras, {
              format: "CODE128",
              width: 1.5,
              height: 40,
              displayValue: true,
              fontSize: 10,
              margin: 2,
              background: "transparent",
              lineColor: "#0a3254ff"
            });
            svgElementLista.setAttribute('data-barcode-generated', 'true');
          } catch (error) {
            console.error('Error al generar código de barras:', error);
          }
        }
      }
    });
  }

  // Abrir modal de categorías
  async abrirModalCategorias() {
    this.categoriaEditando = null;
    this.inicializarFormularioCategoria();
    await this.cargarCategorias();
    this.mostrandoModalCategorias = true;
  }

  cerrarModalCategorias() {
    this.mostrandoModalCategorias = false;
    this.categoriaEditando = null;
    this.inicializarFormularioCategoria();
  }

  async crearCategoria() {
    if (this.formularioCategoria.invalid || !this.usuarioId) {
      this.formularioCategoria.get('nombre')?.markAsTouched();
      return;
    }

    const nombre = this.formularioCategoria.value.nombre.trim();
    
    if (!nombre) {
      this.mostrarToast('El nombre de la categoría es requerido', 'danger');
      return;
    }

    const categoriaExistente = this.categorias.find(
      cat => cat.nombre.toLowerCase() === nombre.toLowerCase() && cat.userId === this.usuarioId
    );

    if (categoriaExistente) {
      this.mostrarToast('Ya existe una categoría con ese nombre', 'danger');
      return;
    }

    this.estaCargandoCategoria = true;

    try {
      if (!this.usuarioId) {
        this.mostrarToast('No se pudo identificar al usuario. Por favor, inicia sesión nuevamente.', 'danger');
        return;
      }

      const categoriasRef = collection(this.firestore, 'categorias');
      const docRef = await addDoc(categoriasRef, {
        nombre: nombre,
        userId: this.usuarioId
      });

      // Log para depuración
      console.log('Categoría creada con ID:', docRef.id, 'userId:', this.usuarioId);

      await new Promise(resolve => setTimeout(resolve, 500));

      await this.cargarCategorias();
      
      this.inicializarFormularioCategoria();
      
      // Log para depuración
      console.log('Categoría creada, total de categorías:', this.categorias.length);
      
      this.mostrarToast('Categoría creada exitosamente', 'success');
    } catch (error: any) {
      console.error('Error al crear categoría:', error);
      
      let mensajeError = 'Error al crear la categoría';
      if (error.code === 'permission-denied' || error.code === 'missing-or-insufficient-permissions') {
        mensajeError = 'No tienes permisos para crear categorías. Verifica las reglas de seguridad de Firestore.';
      } else if (error.message) {
        mensajeError = `Error: ${error.message}`;
      }
      
      this.mostrarToast(mensajeError, 'danger');
    } finally {
      this.estaCargandoCategoria = false;
    }
  }

  // Editar categoría
  editarCategoria(categoria: any) {
    this.categoriaEditando = categoria;
    this.formularioCategoria.patchValue({
      nombre: categoria.nombre
    });
  }

  // Cancelar edición de categoría
  cancelarEdicionCategoria() {
    this.categoriaEditando = null;
    this.inicializarFormularioCategoria();
  }

  async guardarEdicionCategoria() {
    if (this.formularioCategoria.invalid || !this.usuarioId || !this.categoriaEditando) {
      this.formularioCategoria.get('nombre')?.markAsTouched();
      return;
    }

    const nombre = this.formularioCategoria.value.nombre.trim();
    
    if (!nombre) {
      this.mostrarToast('El nombre de la categoría es requerido', 'danger');
      return;
    }

    const categoriaExistente = this.categorias.find(
      cat => cat.id !== this.categoriaEditando.id && 
            cat.nombre.toLowerCase() === nombre.toLowerCase() && 
            cat.userId === this.usuarioId
    );

    if (categoriaExistente) {
      this.mostrarToast('Ya existe una categoría con ese nombre', 'danger');
      return;
    }

    this.estaCargandoCategoria = true;

    try {
      const categoriaRef = doc(this.firestore, 'categorias', this.categoriaEditando.id);
      await updateDoc(categoriaRef, {
        nombre: nombre
      });

      await this.cargarCategorias();
      this.cancelarEdicionCategoria();
      
      this.mostrarToast('Categoría actualizada exitosamente', 'success');
    } catch (error: any) {
      console.error('Error al actualizar categoría:', error);
      
      let mensajeError = 'Error al actualizar la categoría';
      if (error.code === 'permission-denied' || error.code === 'missing-or-insufficient-permissions') {
        mensajeError = 'No tienes permisos para actualizar categorías. Verifica las reglas de seguridad de Firestore.';
      } else if (error.message) {
        mensajeError = `Error: ${error.message}`;
      }
      
      this.mostrarToast(mensajeError, 'danger');
    } finally {
      this.estaCargandoCategoria = false;
    }
  }

  async contarProductosCategoria(categoriaId: string): Promise<number> {
    if (!this.usuarioId) return 0;

    try {
      const productosRef = collection(this.firestore, 'productos');
      const q = query(
        productosRef,
        where('userId', '==', this.usuarioId),
        where('categoriaId', '==', categoriaId)
      );
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('Error al contar productos:', error);
      return 0;
    }
  }

  async eliminarCategoria(categoria: any) {
    if (!this.usuarioId) return;

    const cantidadProductos = await this.contarProductosCategoria(categoria.id);

    const alert = await this.alertController.create({
      header: 'Eliminar Categoría',
      message: cantidadProductos > 0
        ? `¿Estás seguro de eliminar la categoría "${categoria.nombre}"? Esta acción eliminará la categoría y dejará ${cantidadProductos} producto(s) sin categoría.`
        : `¿Estás seguro de eliminar la categoría "${categoria.nombre}"?`,
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
              const categoriaRef = doc(this.firestore, 'categorias', categoria.id);
              await deleteDoc(categoriaRef);

              await this.cargarCategorias();
              await this.cargarProductos();
              
              this.mostrarToast('Categoría eliminada exitosamente', 'success');
            } catch (error: any) {
              console.error('Error al eliminar categoría:', error);
              
              let mensajeError = 'Error al eliminar la categoría';
              if (error.code === 'permission-denied' || error.code === 'missing-or-insufficient-permissions') {
                mensajeError = 'No tienes permisos para eliminar categorías. Verifica las reglas de seguridad de Firestore.';
              } else if (error.message) {
                mensajeError = `Error: ${error.message}`;
              }
              
              this.mostrarToast(mensajeError, 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  // Asignar categoría rápidamente a un producto
  async asignarCategoriaRapida(producto: any) {
    if (!this.usuarioId || !producto) return;

    await this.cargarCategorias();

    if (this.categorias.length === 0) {
      this.mostrarToast('No hay categorías disponibles. Crea una categoría primero.', 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Asignar Categoría',
      message: `Selecciona una categoría para "${producto.nombre}"`,
      inputs: this.categorias.map(cat => ({
        type: 'radio',
        label: cat.nombre,
        value: cat.id,
        checked: producto.categoriaId === cat.id
      })),
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Sin categoría',
          handler: async () => {
            await this.actualizarCategoriaProducto(producto.id, null);
          }
        },
        {
          text: 'Asignar',
          handler: async (categoriaId) => {
            if (categoriaId) {
              await this.actualizarCategoriaProducto(producto.id, categoriaId);
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async actualizarCategoriaProducto(productoId: string, categoriaId: string | null) {
    if (!this.usuarioId) return;

    try {
      const productoRef = doc(this.firestore, 'productos', productoId);
      await updateDoc(productoRef, {
        categoriaId: categoriaId
      });

      await this.cargarProductos();
      
      this.mostrarToast('Categoría asignada exitosamente', 'success');
    } catch (error: any) {
      console.error('Error al actualizar categoría del producto:', error);
      this.mostrarToast('Error al asignar la categoría', 'danger');
    }
  }
}
