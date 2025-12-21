import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonSearchbar, ToastController, IonCard, IonCardContent, IonModal, IonButtons, IonTitle, AlertController } from '@ionic/angular/standalone';
import { arrowBack, add, remove, trash, barcode, search, cart, cash, card, swapHorizontal, checkmarkCircle, receipt } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, collection, addDoc, getDocs, query, where, doc, updateDoc, getDoc, serverTimestamp, Timestamp } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { BrowserMultiFormatReader } from '@zxing/library';

interface ProductoCarrito {
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
  subtotal: number;
  stockDisponible: number;
}

@Component({
  selector: 'app-ventas',
  templateUrl: './ventas.component.html',
  styleUrls: ['./ventas.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonSearchbar, CommonModule, FormsModule, IonCard, IonCardContent, IonModal, IonButtons, IonTitle, RouterModule]
})
export class VentasComponent implements OnInit {
  verificandoAuth: boolean = true;
  usuarioId: string | null = null;
  
  carrito: ProductoCarrito[] = [];
  total: number = 0;
  private readonly CARRITO_STORAGE_KEY = 'zypos_carrito_ventas';
  
  terminoBusqueda: string = '';
  productos: any[] = [];
  productosFiltrados: any[] = [];
  estaCargandoProductos: boolean = false;
  mostrandoBusqueda: boolean = false;
  
  mostrandoModalPago: boolean = false;
  metodoPago: 'efectivo' | 'mercadopago' | 'transferencia' | null = null;
  montoRecibido: number = 0;
  cambio: number = 0;
  estaProcesandoVenta: boolean = false;
  
  esPlataformaMovil: boolean = false;
  
  constructor(
    private auth: Auth,
    private router: Router,
    private firestore: Firestore,
    private toastController: ToastController,
    private alertController: AlertController
  ) {
    addIcons({ arrowBack, add, remove, trash, barcode, search, cart, cash, card, swapHorizontal, checkmarkCircle, receipt });
  }

  async ngOnInit() {
    this.esPlataformaMovil = Capacitor.getPlatform() !== 'web';
    
    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      } else {
        if (user.uid !== this.usuarioId) {
          this.usuarioId = user.uid;
          this.verificandoAuth = false;
          this.cargarCarrito();
          await this.cargarProductos();
        }
      }
    });
  }

  cargarCarrito(): void {
    try {
      const carritoStr = localStorage.getItem(this.CARRITO_STORAGE_KEY);
      if (carritoStr) {
        this.carrito = JSON.parse(carritoStr);
        this.calcularTotal();
      }
    } catch (error) {
      console.error('Error al cargar carrito:', error);
      this.carrito = [];
    }
  }
  
  guardarCarrito(): void {
    try {
      localStorage.setItem(this.CARRITO_STORAGE_KEY, JSON.stringify(this.carrito));
    } catch (error) {
      console.error('Error al guardar carrito:', error);
    }
  }
  
  calcularTotal(): void {
    this.total = this.carrito.reduce((sum, item) => sum + item.subtotal, 0);
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
      
      this.aplicarFiltroBusqueda();
    } catch (error) {
      console.error('Error al cargar productos:', error);
      this.mostrarToast('Error al cargar productos', 'danger');
    } finally {
      this.estaCargandoProductos = false;
    }
  }
  
  aplicarFiltroBusqueda(): void {
    if (!this.terminoBusqueda.trim()) {
      this.productosFiltrados = [];
      return;
    }
    
    const busqueda = this.terminoBusqueda.toLowerCase().trim();
    this.productosFiltrados = this.productos.filter(producto => {
      const nombre = (producto.nombre || '').toLowerCase();
      const codigoBarras = (producto.codigoBarras || '').toLowerCase();
      return nombre.includes(busqueda) || codigoBarras.includes(busqueda);
    });
  }
  
  onBuscar(event: any): void {
    this.terminoBusqueda = event.detail.value || '';
    this.aplicarFiltroBusqueda();
    this.mostrandoBusqueda = this.terminoBusqueda.length > 0;
  }
  
  async agregarProductoAlCarrito(producto: any, cantidad: number = 1): Promise<void> {
    if (producto.stock < cantidad) {
      this.mostrarToast(`Stock insuficiente. Disponible: ${producto.stock}`, 'warning');
      return;
    }
    
    const itemExistente = this.carrito.find(item => item.productoId === producto.id);
    
    if (itemExistente) {
      const nuevaCantidad = itemExistente.cantidad + cantidad;
      if (nuevaCantidad > producto.stock) {
        this.mostrarToast(`Stock insuficiente. Disponible: ${producto.stock}`, 'warning');
        return;
      }
      
      itemExistente.cantidad = nuevaCantidad;
      itemExistente.subtotal = itemExistente.precio * itemExistente.cantidad;
    } else {
      this.carrito.push({
        productoId: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: cantidad,
        subtotal: producto.precio * cantidad,
        stockDisponible: producto.stock
      });
    }
    
    this.calcularTotal();
    this.guardarCarrito();
    this.mostrarToast('Producto agregado al carrito', 'success');
  }
  
  async seleccionarProducto(producto: any): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Cantidad',
      message: `Ingresa la cantidad de "${producto.nombre}"`,
      inputs: [
        {
          name: 'cantidad',
          type: 'number',
          placeholder: 'Cantidad',
          min: 1,
          max: producto.stock,
          value: '1'
        }
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Agregar',
          handler: (data) => {
            const cantidad = parseInt(data.cantidad);
            if (cantidad > 0 && cantidad <= producto.stock) {
              this.agregarProductoAlCarrito(producto, cantidad);
            } else {
              this.mostrarToast('Cantidad inválida', 'danger');
            }
          }
        }
      ]
    });
    
    await alert.present();
  }
  
  async escanearCodigoBarras(): Promise<void> {
    try {
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

        const codeReader = new BrowserMultiFormatReader();
        
        try {
          const resultado = await codeReader.decodeFromImageElement(img);
          
          if (resultado && resultado.getText()) {
            const codigoBarras = resultado.getText();
            await this.buscarProductoPorCodigo(codigoBarras);
          } else {
            this.mostrarToast('No se pudo leer el código de barras', 'warning');
          }
        } catch (decodeError) {
          console.error('Error al decodificar código de barras:', decodeError);
          this.mostrarToast('No se pudo leer el código de barras', 'warning');
        }
      }
    } catch (error: any) {
      if (error.message !== 'User cancelled photos app' && !error.message?.includes('cancel')) {
        console.error('Error al escanear código de barras:', error);
        this.mostrarToast('Error al escanear el código de barras', 'danger');
      }
    }
  }
  
  async buscarProductoPorCodigo(codigoBarras: string): Promise<void> {
    if (!this.usuarioId) return;
    
    try {
      const productosRef = collection(this.firestore, 'productos');
      const q = query(
        productosRef,
        where('userId', '==', this.usuarioId),
        where('codigoBarras', '==', codigoBarras)
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        const alert = await this.alertController.create({
          header: 'Producto no encontrado',
          message: `No se encontró un producto con el código de barras: ${codigoBarras}`,
          buttons: [
            {
              text: 'Buscar manualmente',
              handler: () => {
                this.terminoBusqueda = codigoBarras;
                this.aplicarFiltroBusqueda();
                this.mostrandoBusqueda = true;
              }
            },
            {
              text: 'Cerrar',
              role: 'cancel'
            }
          ]
        });
        await alert.present();
      } else {
        const producto = {
          id: querySnapshot.docs[0].id,
          ...querySnapshot.docs[0].data()
        };
        await this.agregarProductoAlCarrito(producto, 1);
      }
    } catch (error) {
      console.error('Error al buscar producto por código:', error);
      this.mostrarToast('Error al buscar el producto', 'danger');
    }
  }
  
  aumentarCantidad(item: ProductoCarrito): void {
    const producto = this.productos.find(p => p.id === item.productoId);
    if (producto && item.cantidad + 1 > producto.stock) {
      this.mostrarToast(`Stock insuficiente. Disponible: ${producto.stock}`, 'warning');
      return;
    }
    
    item.cantidad++;
    item.subtotal = item.precio * item.cantidad;
    this.calcularTotal();
    this.guardarCarrito();
  }
  
  disminuirCantidad(item: ProductoCarrito): void {
    if (item.cantidad > 1) {
      item.cantidad--;
      item.subtotal = item.precio * item.cantidad;
      this.calcularTotal();
      this.guardarCarrito();
    }
  }
  
  eliminarProductoDelCarrito(item: ProductoCarrito): void {
    this.carrito = this.carrito.filter(i => i.productoId !== item.productoId);
    this.calcularTotal();
    this.guardarCarrito();
    this.mostrarToast('Producto eliminado del carrito', 'success');
  }
  
  async vaciarCarrito(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Vaciar carrito',
      message: '¿Estás seguro de vaciar todo el carrito?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Vaciar',
          role: 'destructive',
          handler: () => {
            this.carrito = [];
            this.total = 0;
            this.guardarCarrito();
            this.mostrarToast('Carrito vaciado', 'success');
          }
        }
      ]
    });
    
    await alert.present();
  }
  
  abrirModalPago(): void {
    if (this.carrito.length === 0) {
      this.mostrarToast('El carrito está vacío', 'warning');
      return;
    }
    this.metodoPago = null;
    this.montoRecibido = 0;
    this.cambio = 0;
    this.mostrandoModalPago = true;
  }
  
  cerrarModalPago(): void {
    this.mostrandoModalPago = false;
    this.metodoPago = null;
    this.montoRecibido = 0;
    this.cambio = 0;
  }
  
  seleccionarMetodoPago(metodo: 'efectivo' | 'mercadopago' | 'transferencia'): void {
    this.metodoPago = metodo;
    if (metodo === 'efectivo') {
      this.montoRecibido = this.total;
      this.calcularCambio();
    }
  }
  
  calcularCambio(): void {
    if (this.metodoPago === 'efectivo' && this.montoRecibido >= this.total) {
      this.cambio = this.montoRecibido - this.total;
    } else {
      this.cambio = 0;
    }
  }
  
  async procesarVenta(): Promise<void> {
    if (!this.metodoPago || !this.usuarioId) {
      this.mostrarToast('Selecciona un método de pago', 'warning');
      return;
    }
    
    if (this.metodoPago === 'efectivo' && this.montoRecibido < this.total) {
      this.mostrarToast('El monto recibido es menor al total', 'danger');
      return;
    }
    
    this.estaProcesandoVenta = true;
    
    try {
      const ventaData: any = {
        userId: this.usuarioId,
        fecha: serverTimestamp(),
        total: this.total,
        metodoPago: this.metodoPago,
        productos: this.carrito.map(item => ({
          productoId: item.productoId,
          nombre: item.nombre,
          precio: item.precio,
          cantidad: item.cantidad,
          subtotal: item.subtotal
        })),
        estado: 'completada',
        anulada: false,
        modificada: false
      };
      
      if (this.metodoPago === 'efectivo') {
        ventaData.montoRecibido = this.montoRecibido;
        ventaData.cambio = this.cambio;
      }
      
      await addDoc(collection(this.firestore, 'ventas'), ventaData);
      
      for (const item of this.carrito) {
        const productoRef = doc(this.firestore, 'productos', item.productoId);
        const productoDoc = await getDoc(productoRef);
        
        if (productoDoc.exists()) {
          const productoData = productoDoc.data();
          const nuevoStock = (productoData['stock'] || 0) - item.cantidad;
          await updateDoc(productoRef, { stock: Math.max(0, nuevoStock) });
        }
      }
      
      this.carrito = [];
      this.total = 0;
      this.guardarCarrito();
      this.cerrarModalPago();
      this.mostrarToast('Venta procesada exitosamente', 'success');
      await this.cargarProductos();
      
    } catch (error) {
      console.error('Error al procesar venta:', error);
      this.mostrarToast('Error al procesar la venta', 'danger');
    } finally {
      this.estaProcesandoVenta = false;
    }
  }
  
  formatearPrecio(precio: number): string {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(precio);
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

