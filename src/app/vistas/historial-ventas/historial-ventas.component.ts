import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonSearchbar, IonSelect, IonSelectOption, IonTextarea, ToastController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge, IonModal, IonButtons, IonTitle, IonCheckbox, AlertController } from '@ionic/angular/standalone';
import { arrowBack, search, close, ban, create, cash, card, swapHorizontal, eye, calendar, time, receipt, checkmarkCircle, closeCircle } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, collection, getDocs, query, where, doc, updateDoc, getDoc, orderBy, Timestamp } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';

interface ProductoVenta {
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
  subtotal: number;
}

interface Venta {
  id: string;
  userId: string;
  fecha: Timestamp | Date;
  total: number;
  metodoPago: 'efectivo' | 'mercadopago' | 'transferencia';
  montoRecibido?: number;
  cambio?: number;
  productos: ProductoVenta[];
  estado: 'completada' | 'anulada' | 'modificada';
  anulada: boolean;
  modificada: boolean;
  motivoAnulacion?: string;
  productosModificados?: any[];
  tipoModificacion?: 'devolucion' | 'cambio';
}

@Component({
  selector: 'app-historial-ventas',
  templateUrl: './historial-ventas.component.html',
  styleUrls: ['./historial-ventas.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonSearchbar, IonSelect, IonSelectOption, IonTextarea, CommonModule, FormsModule, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge, IonModal, IonButtons, IonTitle, IonCheckbox]
})
export class HistorialVentasComponent implements OnInit {
  verificandoAuth: boolean = true;
  usuarioId: string | null = null;
  
  ventas: Venta[] = [];
  ventasFiltradas: Venta[] = [];
  estaCargandoVentas: boolean = false;
  
  terminoBusqueda: string = '';
  filtroPeriodo: 'todos' | 'dia' | 'semana' | 'mes' = 'todos';
  
  mostrandoModalDetalle: boolean = false;
  mostrandoModalAnular: boolean = false;
  mostrandoModalModificar: boolean = false;
  ventaSeleccionada: Venta | null = null;
  
  productosAnulacion: any[] = [];
  motivoAnulacion: string = '';
  
  productosModificacion: any[] = [];
  productosSeleccionados: string[] = [];
  tipoModificacion: 'devolucion' | 'cambio' | null = null;
  productoCambio: any = null;
  productosDisponibles: any[] = [];
  
  constructor(
    private auth: Auth,
    private router: Router,
    private firestore: Firestore,
    private toastController: ToastController,
    private alertController: AlertController
  ) {
    addIcons({ arrowBack, search, close, ban, create, cash, card, swapHorizontal, eye, calendar, time, receipt, checkmarkCircle, closeCircle });
  }

  async ngOnInit() {
    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      } else {
        if (user.uid !== this.usuarioId) {
          this.usuarioId = user.uid;
          this.verificandoAuth = false;
          await this.cargarVentas();
        }
      }
    });
  }

  async cargarVentas() {
    if (!this.usuarioId) return;
    
    this.estaCargandoVentas = true;
    try {
      const ventasRef = collection(this.firestore, 'ventas');
      
      let querySnapshot;
      try {
        const q = query(
          ventasRef,
          where('userId', '==', this.usuarioId),
          orderBy('fecha', 'desc')
        );
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        if (orderByError.code === 'failed-precondition') {
          const q = query(
            ventasRef,
            where('userId', '==', this.usuarioId)
          );
          querySnapshot = await getDocs(q);
        } else {
          throw orderByError;
        }
      }
      
      this.ventas = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          fecha: data['fecha'] instanceof Timestamp ? data['fecha'] : new Date(data['fecha'])
        } as Venta;
      });
      
      // Ordenar por fecha descendente si no se pudo hacer con orderBy
      this.ventas.sort((a, b) => {
        const fechaA = a.fecha instanceof Timestamp ? a.fecha.toDate() : new Date(a.fecha);
        const fechaB = b.fecha instanceof Timestamp ? b.fecha.toDate() : new Date(b.fecha);
        return fechaB.getTime() - fechaA.getTime();
      });
      
      this.aplicarFiltros();
    } catch (error: any) {
      console.error('Error al cargar ventas:', error);
      const mensajeError = error.code === 'failed-precondition' 
        ? 'Error: Se requiere crear un índice en Firestore. Consulta la consola para más detalles.'
        : 'Error al cargar las ventas';
      this.mostrarToast(mensajeError, 'danger');
      this.ventas = [];
      this.ventasFiltradas = [];
    } finally {
      this.estaCargandoVentas = false;
    }
  }
  
  aplicarFiltros(): void {
    let ventasFiltradas = [...this.ventas];
    
    // Filtro por búsqueda (ID de venta)
    if (this.terminoBusqueda.trim()) {
      const busqueda = this.terminoBusqueda.toLowerCase().trim();
      ventasFiltradas = ventasFiltradas.filter(venta => 
        venta.id.toLowerCase().includes(busqueda)
      );
    }
    
    // Filtro por período
    if (this.filtroPeriodo !== 'todos') {
      const ahora = new Date();
      ventasFiltradas = ventasFiltradas.filter(venta => {
        const fechaVenta = venta.fecha instanceof Timestamp 
          ? venta.fecha.toDate() 
          : new Date(venta.fecha);
        
        switch (this.filtroPeriodo) {
          case 'dia':
            return fechaVenta.toDateString() === ahora.toDateString();
          case 'semana':
            const inicioSemana = new Date(ahora);
            inicioSemana.setDate(ahora.getDate() - ahora.getDay());
            inicioSemana.setHours(0, 0, 0, 0);
            return fechaVenta >= inicioSemana;
          case 'mes':
            return fechaVenta.getMonth() === ahora.getMonth() && 
                   fechaVenta.getFullYear() === ahora.getFullYear();
          default:
            return true;
        }
      });
    }
    
    this.ventasFiltradas = ventasFiltradas;
  }
  
  onBuscar(event: any): void {
    this.terminoBusqueda = event.detail.value || '';
    this.aplicarFiltros();
  }
  
  cambiarFiltroPeriodo(): void {
    this.aplicarFiltros();
  }
  
  abrirModalDetalle(venta: Venta): void {
    this.ventaSeleccionada = venta;
    this.mostrandoModalDetalle = true;
  }
  
  cerrarModalDetalle(): void {
    this.mostrandoModalDetalle = false;
    this.ventaSeleccionada = null;
  }
  
  async abrirModalAnular(venta: Venta): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Confirmar anulación',
      message: `¿Estás seguro de anular la venta ${venta.id}?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Anular',
          role: 'destructive',
          handler: () => {
            this.ventaSeleccionada = venta;
            this.prepararAnulacion(venta);
            this.mostrandoModalAnular = true;
          }
        }
      ]
    });
    
    await alert.present();
  }
  
  prepararAnulacion(venta: Venta): void {
    // Expandir cada producto en unidades individuales
    this.productosAnulacion = [];
    venta.productos.forEach((producto, productoIndex) => {
      for (let i = 0; i < producto.cantidad; i++) {
        this.productosAnulacion.push({
          productoId: producto.productoId,
          nombre: producto.nombre,
          precio: producto.precio,
          cantidad: 1, // Cada unidad es 1
          subtotal: producto.precio, // Subtotal unitario
          estado: 'buen estado',
          productoIndex: productoIndex, // Índice del producto original
          unidadIndex: i // Índice de la unidad dentro del producto
        });
      }
    });
    this.motivoAnulacion = '';
  }
  
  cerrarModalAnular(): void {
    this.mostrandoModalAnular = false;
    this.ventaSeleccionada = null;
    this.productosAnulacion = [];
    this.motivoAnulacion = '';
  }
  
  async confirmarAnulacion(): Promise<void> {
    if (!this.ventaSeleccionada || !this.usuarioId) return;
    
    try {
      // Agrupar unidades por productoId y contar cuántas están en "buen estado"
      const stockARestaurar: { [key: string]: number } = {};
      
      for (const unidad of this.productosAnulacion) {
        if (unidad.estado === 'buen estado') {
          if (!stockARestaurar[unidad.productoId]) {
            stockARestaurar[unidad.productoId] = 0;
          }
          stockARestaurar[unidad.productoId] += 1; // Cada unidad cuenta como 1
        }
      }
      
      for (const productoId in stockARestaurar) {
        const cantidadARestaurar = stockARestaurar[productoId];
        const productoRef = doc(this.firestore, 'productos', productoId);
        const productoDoc = await getDoc(productoRef);
        
        if (productoDoc.exists()) {
          const productoData = productoDoc.data();
          const stockActual = productoData['stock'] || 0;
          await updateDoc(productoRef, {
            stock: stockActual + cantidadARestaurar
          });
        }
      }
      
      const ventaRef = doc(this.firestore, 'ventas', this.ventaSeleccionada.id);
      await updateDoc(ventaRef, {
        estado: 'anulada',
        anulada: true,
        motivoAnulacion: this.motivoAnulacion || null
      });
      
      this.mostrarToast('Venta anulada exitosamente', 'success');
      this.cerrarModalAnular();
      await this.cargarVentas();
      
    } catch (error) {
      console.error('Error al anular venta:', error);
      this.mostrarToast('Error al anular la venta', 'danger');
    }
  }
  
  async abrirModalModificar(venta: Venta): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Confirmar modificación',
      message: `¿Estás seguro de modificar la venta ${venta.id}?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Modificar',
          handler: () => {
            this.ventaSeleccionada = venta;
            this.prepararModificacion(venta);
            this.mostrandoModalModificar = true;
          }
        }
      ]
    });
    
    await alert.present();
  }
  
  async prepararModificacion(venta: Venta): Promise<void> {
    // Expandir cada producto en unidades individuales
    this.productosModificacion = [];
    venta.productos.forEach((producto, productoIndex) => {
      for (let i = 0; i < producto.cantidad; i++) {
        this.productosModificacion.push({
          productoId: producto.productoId,
          nombre: producto.nombre,
          precio: producto.precio,
          cantidad: 1, // Cada unidad es 1
          subtotal: producto.precio, // Subtotal unitario
          estado: 'buen estado',
          seleccionado: false,
          productoIndex: productoIndex, // Índice del producto original
          unidadIndex: i, // Índice de la unidad dentro del producto
          unidadId: `${producto.productoId}-${i}` // ID único para cada unidad
        });
      }
    });
    this.productosSeleccionados = [];
    this.tipoModificacion = null;
    this.productoCambio = null;
    
    await this.cargarProductosDisponibles();
  }
  
  async cargarProductosDisponibles(): Promise<void> {
    if (!this.usuarioId) return;
    
    try {
      const productosRef = collection(this.firestore, 'productos');
      const q = query(productosRef, where('userId', '==', this.usuarioId));
      const querySnapshot = await getDocs(q);
      
      this.productosDisponibles = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error al cargar productos:', error);
    }
  }
  
  cerrarModalModificar(): void {
    this.mostrandoModalModificar = false;
    this.ventaSeleccionada = null;
    this.productosModificacion = [];
    this.productosSeleccionados = [];
    this.tipoModificacion = null;
    this.productoCambio = null;
  }
  
  toggleProductoSeleccionado(unidadId: string): void {
    const index = this.productosSeleccionados.indexOf(unidadId);
    if (index > -1) {
      this.productosSeleccionados.splice(index, 1);
    } else {
      this.productosSeleccionados.push(unidadId);
    }
  }
  
  productosSeleccionadosDisponibles(): boolean {
    return this.productosSeleccionados.length > 0;
  }
  
  async confirmarModificacion(): Promise<void> {
    if (!this.ventaSeleccionada || !this.tipoModificacion || this.productosSeleccionados.length === 0) {
      this.mostrarToast('Selecciona unidades y tipo de modificación', 'warning');
      return;
    }
    
    if (this.tipoModificacion === 'cambio' && !this.productoCambio) {
      this.mostrarToast('Selecciona el producto por el que se cambió', 'warning');
      return;
    }
    
    try {
      // Filtrar solo las unidades seleccionadas
      const unidadesSeleccionadas = this.productosModificacion
        .filter(p => this.productosSeleccionados.includes(p.unidadId));
      
      // Agrupar unidades por productoId y contar cuántas están en "buen estado"
      const stockARestaurar: { [key: string]: number } = {};
      const productosModificados: any[] = [];
      
      // Agrupar por productoId para el registro
      const productosAgrupados: { [key: string]: any } = {};
      
      unidadesSeleccionadas.forEach(unidad => {
        if (!productosAgrupados[unidad.productoId]) {
          productosAgrupados[unidad.productoId] = {
            productoId: unidad.productoId,
            nombre: unidad.nombre,
            cantidad: 0,
            unidadesBuenEstado: 0,
            unidadesMalEstado: 0
          };
        }
        productosAgrupados[unidad.productoId].cantidad += 1;
        
        if (unidad.estado === 'buen estado') {
          productosAgrupados[unidad.productoId].unidadesBuenEstado += 1;
          if (!stockARestaurar[unidad.productoId]) {
            stockARestaurar[unidad.productoId] = 0;
          }
          stockARestaurar[unidad.productoId] += 1;
        } else {
          productosAgrupados[unidad.productoId].unidadesMalEstado += 1;
        }
      });
      
      // Convertir a array para guardar
      for (const productoId in productosAgrupados) {
        productosModificados.push({
          productoId: productosAgrupados[productoId].productoId,
          nombre: productosAgrupados[productoId].nombre,
          cantidad: productosAgrupados[productoId].cantidad,
          unidadesBuenEstado: productosAgrupados[productoId].unidadesBuenEstado,
          unidadesMalEstado: productosAgrupados[productoId].unidadesMalEstado
        });
      }
      
      if (this.tipoModificacion === 'devolucion') {
        for (const productoId in stockARestaurar) {
          const cantidadARestaurar = stockARestaurar[productoId];
          const productoRef = doc(this.firestore, 'productos', productoId);
          const productoDoc = await getDoc(productoRef);
          
          if (productoDoc.exists()) {
            const productoData = productoDoc.data();
            const stockActual = productoData['stock'] || 0;
            await updateDoc(productoRef, {
              stock: stockActual + cantidadARestaurar
            });
          }
        }
      } else if (this.tipoModificacion === 'cambio') {
        for (const productoId in stockARestaurar) {
          const cantidadARestaurar = stockARestaurar[productoId];
          const productoRef = doc(this.firestore, 'productos', productoId);
          const productoDoc = await getDoc(productoRef);
          
          if (productoDoc.exists()) {
            const productoData = productoDoc.data();
            const stockActual = productoData['stock'] || 0;
            await updateDoc(productoRef, {
              stock: stockActual + cantidadARestaurar
            });
          }
        }
        
        if (this.productoCambio) {
          const productoRef = doc(this.firestore, 'productos', this.productoCambio.id);
          const productoDoc = await getDoc(productoRef);
          
          if (productoDoc.exists()) {
            const productoData = productoDoc.data();
            const stockActual = productoData['stock'] || 0;
            const cantidadCambio = unidadesSeleccionadas.length; // Total de unidades seleccionadas
            await updateDoc(productoRef, {
              stock: Math.max(0, stockActual - cantidadCambio)
            });
          }
        }
      }
      
      const productosRestantes: any[] = [];
      const unidadesAEliminar: { [key: string]: number } = {};
      
      unidadesSeleccionadas.forEach(unidad => {
        if (!unidadesAEliminar[unidad.productoId]) {
          unidadesAEliminar[unidad.productoId] = 0;
        }
        unidadesAEliminar[unidad.productoId] += 1;
      });
      
      this.ventaSeleccionada.productos.forEach(producto => {
        const cantidadAEliminar = unidadesAEliminar[producto.productoId] || 0;
        const cantidadRestante = producto.cantidad - cantidadAEliminar;
        
        if (cantidadRestante > 0) {
          const nuevoSubtotal = producto.precio * cantidadRestante;
          productosRestantes.push({
            productoId: producto.productoId,
            nombre: producto.nombre,
            precio: producto.precio,
            cantidad: cantidadRestante,
            subtotal: nuevoSubtotal
          });
        }
      });
      
      if (this.tipoModificacion === 'cambio' && this.productoCambio) {
        const cantidadCambio = unidadesSeleccionadas.length;
        
        let precioProductoCambio = this.productoCambio.precio;
        if (!precioProductoCambio) {
          const productoRef = doc(this.firestore, 'productos', this.productoCambio.id);
          const productoDoc = await getDoc(productoRef);
          if (productoDoc.exists()) {
            const productoData = productoDoc.data();
            precioProductoCambio = productoData['precio'] || 0;
          } else {
            precioProductoCambio = 0;
          }
        }
        
        const productoCambioExistente = productosRestantes.find(p => p.productoId === this.productoCambio.id);
        
        if (productoCambioExistente) {
          productoCambioExistente.cantidad += cantidadCambio;
          productoCambioExistente.subtotal = productoCambioExistente.precio * productoCambioExistente.cantidad;
        } else {
          productosRestantes.push({
            productoId: this.productoCambio.id,
            nombre: this.productoCambio.nombre,
            precio: precioProductoCambio,
            cantidad: cantidadCambio,
            subtotal: precioProductoCambio * cantidadCambio
          });
        }
      }
      
      const nuevoTotal = productosRestantes.reduce((sum, p) => sum + p.subtotal, 0);
      
      const ventaRef = doc(this.firestore, 'ventas', this.ventaSeleccionada.id);
      await updateDoc(ventaRef, {
        estado: 'modificada',
        modificada: true,
        tipoModificacion: this.tipoModificacion,
        productosModificados: productosModificados,
        productoCambio: this.tipoModificacion === 'cambio' ? {
          productoId: this.productoCambio.id,
          nombre: this.productoCambio.nombre
        } : null,
        productos: productosRestantes,
        total: nuevoTotal
      });
      
      this.mostrarToast('Venta modificada exitosamente', 'success');
      this.cerrarModalModificar();
      await this.cargarVentas();
      
    } catch (error) {
      console.error('Error al modificar venta:', error);
      this.mostrarToast('Error al modificar la venta', 'danger');
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
  
  formatearFecha(fecha: Timestamp | Date): string {
    const fechaObj = fecha instanceof Timestamp ? fecha.toDate() : new Date(fecha);
    return fechaObj.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
  
  formatearHora(fecha: Timestamp | Date): string {
    const fechaObj = fecha instanceof Timestamp ? fecha.toDate() : new Date(fecha);
    return fechaObj.toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  obtenerNombreMetodoPago(metodo: string): string {
    switch (metodo) {
      case 'efectivo':
        return 'Efectivo';
      case 'mercadopago':
        return 'MercadoPago';
      case 'transferencia':
        return 'Transferencia';
      default:
        return metodo;
    }
  }
  
  obtenerTextoPeriodo(periodo: string): string {
    switch (periodo) {
      case 'todos':
        return 'Todas';
      case 'dia':
        return 'Hoy';
      case 'semana':
        return 'Esta semana';
      case 'mes':
        return 'Este mes';
      default:
        return 'Selecciona un período';
    }
  }
  
  obtenerIconoMetodoPago(metodo: string): string {
    switch (metodo) {
      case 'efectivo':
        return 'cash';
      case 'mercadopago':
        return 'card';
      case 'transferencia':
        return 'swap-horizontal';
      default:
        return 'card';
    }
  }
  
  contarProductos(venta: Venta): number {
    return venta.productos.reduce((sum, p) => sum + p.cantidad, 0);
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

