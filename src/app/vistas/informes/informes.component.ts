import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel, IonSegment, IonSegmentButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge, ToastController, IonModal, IonButtons, IonTitle, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { arrowBack, barChart, trendingUp, trendingDown, download, document, calendar, time, receipt, cube, cash } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, collection, getDocs, query, where, Timestamp } from '@angular/fire/firestore';
import { Chart, registerables } from 'chart.js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  productos: ProductoVenta[];
  estado: 'completada' | 'anulada' | 'modificada';
  anulada: boolean;
}

interface ProductoReporte {
  productoId: string;
  nombre: string;
  cantidadVendida: number;
  ingresosGenerados: number;
}

@Component({
  selector: 'app-informes',
  templateUrl: './informes.component.html',
  styleUrls: ['./informes.component.scss'],
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonItem, IonLabel,
    IonSegment, IonSegmentButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    IonBadge, CommonModule, FormsModule, IonModal, IonButtons, IonTitle,
    IonSelect, IonSelectOption
  ]
})
export class InformesComponent implements OnInit, AfterViewInit {
  verificandoAuth: boolean = true;
  usuarioId: string | null = null;
  
  periodoSeleccionado: 'dia' | 'semana' | 'mes' = 'dia';
  
  ventas: Venta[] = [];
  ventasFiltradas: Venta[] = [];
  estaCargandoVentas: boolean = false;
  
  totalVentas: number = 0;
  cantidadVentas: number = 0;
  promedioVenta: number = 0;
  
  productosMasVendidos: ProductoReporte[] = [];
  productosMenosVendidos: ProductoReporte[] = [];
  
  mostrarGraficoTendencias: boolean = true;
  
  mostrandoModalExportar: boolean = false;
  tipoReporteExportar: 'general' | 'masVendidos' | 'menosVendidos' | 'todos' = 'todos';
  formatoExportar: 'excel' | 'pdf' = 'excel';
  estaExportando: boolean = false;
  
  @ViewChild('canvasTendencias', { static: false }) canvasTendencias!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasMasVendidos', { static: false }) canvasMasVendidos!: ElementRef<HTMLCanvasElement>;
  
  private chartTendencias: Chart | null = null;
  private chartMasVendidos: Chart | null = null;

  constructor(
    private auth: Auth,
    private router: Router,
    private firestore: Firestore,
    private toastController: ToastController
  ) {
    Chart.register(...registerables);
    addIcons({ arrowBack, barChart, trendingUp, trendingDown, download, document, calendar, time, receipt, cube, cash });
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
          await this.cargarVentas();
        }
      }
    });
  }

  ngAfterViewInit() {
    // Los gráficos se crearán cuando haya datos y los canvas estén disponibles
    setTimeout(() => {
      if (this.ventasFiltradas.length > 0 && this.canvasTendencias && this.canvasMasVendidos) {
        this.actualizarGraficoTendencias();
        this.actualizarGraficoMasVendidos();
      }
    }, 200);
  }

  async cargarVentas() {
    if (!this.usuarioId) return;
    
    this.estaCargandoVentas = true;
    try {
      const ventasRef = collection(this.firestore, 'ventas');
      const q = query(
        ventasRef,
        where('userId', '==', this.usuarioId),
        where('anulada', '==', false)
      );
      
      const querySnapshot = await getDocs(q);
      
      this.ventas = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          fecha: data['fecha'] instanceof Timestamp ? data['fecha'] : new Date(data['fecha'])
        } as Venta;
      });
      
      this.ventas.sort((a, b) => {
        const fechaA = a.fecha instanceof Timestamp ? a.fecha.toDate() : new Date(a.fecha);
        const fechaB = b.fecha instanceof Timestamp ? b.fecha.toDate() : new Date(b.fecha);
        return fechaB.getTime() - fechaA.getTime();
      });
      
      this.aplicarFiltroPeriodo();
    } catch (error: any) {
      console.error('Error al cargar ventas:', error);
      this.mostrarToast('Error al cargar las ventas', 'danger');
      this.ventas = [];
      this.ventasFiltradas = [];
    } finally {
      this.estaCargandoVentas = false;
    }
  }
  
  cambiarPeriodo() {
    this.aplicarFiltroPeriodo();
  }
  
  aplicarFiltroPeriodo(): void {
    const ahora = new Date();
    let fechaInicio: Date;
    
    switch (this.periodoSeleccionado) {
      case 'dia':
        fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
        break;
      case 'semana':
        const inicioSemana = new Date(ahora);
        inicioSemana.setDate(ahora.getDate() - ahora.getDay());
        inicioSemana.setHours(0, 0, 0, 0);
        fechaInicio = inicioSemana;
        break;
      case 'mes':
        fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        break;
      default:
        fechaInicio = new Date(0);
    }
    
    this.ventasFiltradas = this.ventas.filter(venta => {
      const fechaVenta = venta.fecha instanceof Timestamp 
        ? venta.fecha.toDate() 
        : new Date(venta.fecha);
      return fechaVenta >= fechaInicio;
    });
    
    this.calcularMetricas();
    this.calcularProductosMasVendidos();
    this.calcularProductosMenosVendidos();
    
    setTimeout(() => {
      this.actualizarGraficoTendencias();
      this.actualizarGraficoMasVendidos();
    }, 100);
  }
  
  calcularMetricas(): void {
    this.cantidadVentas = this.ventasFiltradas.length;
    this.totalVentas = this.ventasFiltradas.reduce((sum, venta) => sum + venta.total, 0);
    this.promedioVenta = this.cantidadVentas > 0 ? this.totalVentas / this.cantidadVentas : 0;
  }
  
  calcularProductosMasVendidos(): void {
    const productosMap: { [key: string]: ProductoReporte } = {};
    
    this.ventasFiltradas.forEach(venta => {
      venta.productos.forEach(producto => {
        if (!productosMap[producto.productoId]) {
          productosMap[producto.productoId] = {
            productoId: producto.productoId,
            nombre: producto.nombre,
            cantidadVendida: 0,
            ingresosGenerados: 0
          };
        }
        productosMap[producto.productoId].cantidadVendida += producto.cantidad;
        productosMap[producto.productoId].ingresosGenerados += producto.subtotal;
      });
    });
    
    this.productosMasVendidos = Object.values(productosMap)
      .sort((a, b) => b.cantidadVendida - a.cantidadVendida)
      .slice(0, 10);
    
    setTimeout(() => {
      this.actualizarGraficoMasVendidos();
    }, 100);
  }
  
  calcularProductosMenosVendidos(): void {
    const productosMap: { [key: string]: ProductoReporte } = {};
    
    this.ventasFiltradas.forEach(venta => {
      venta.productos.forEach(producto => {
        if (!productosMap[producto.productoId]) {
          productosMap[producto.productoId] = {
            productoId: producto.productoId,
            nombre: producto.nombre,
            cantidadVendida: 0,
            ingresosGenerados: 0
          };
        }
        productosMap[producto.productoId].cantidadVendida += producto.cantidad;
        productosMap[producto.productoId].ingresosGenerados += producto.subtotal;
      });
    });
    
    this.productosMenosVendidos = Object.values(productosMap)
      .sort((a, b) => a.cantidadVendida - b.cantidadVendida)
      .slice(0, 10);
  }
  
  actualizarGraficoTendencias(): void {
    if (!this.mostrarGraficoTendencias || !this.canvasTendencias) return;
    
    // Destruir gráfico anterior si existe
    if (this.chartTendencias) {
      this.chartTendencias.destroy();
    }
    
    // Agrupar ventas por día
    const ventasPorDia: { [key: string]: number } = {};
    
    this.ventasFiltradas.forEach(venta => {
      const fechaVenta = venta.fecha instanceof Timestamp 
        ? venta.fecha.toDate() 
        : new Date(venta.fecha);
      const fechaKey = fechaVenta.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
      
      if (!ventasPorDia[fechaKey]) {
        ventasPorDia[fechaKey] = 0;
      }
      ventasPorDia[fechaKey] += venta.total;
    });
    
    const labels = Object.keys(ventasPorDia).sort();
    const datos = labels.map(label => ventasPorDia[label]);
    
    const ctx = this.canvasTendencias.nativeElement.getContext('2d');
    if (!ctx) return;
    
    this.chartTendencias = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Ventas',
          data: datos,
          backgroundColor: 'rgba(248, 149, 133, 0.6)',
          borderColor: '#f89585',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            enabled: true,
            callbacks: {
              label: (context) => {
                const value = context.parsed.y;
                if (value === null || value === undefined) return '';
                return new Intl.NumberFormat('es-CL', {
                  style: 'currency',
                  currency: 'CLP',
                  minimumFractionDigits: 0
                }).format(value);
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value: any) {
                return new Intl.NumberFormat('es-CL', {
                  style: 'currency',
                  currency: 'CLP',
                  minimumFractionDigits: 0
                }).format(value);
              }
            }
          }
        }
      }
    });
  }
  
  actualizarGraficoMasVendidos(): void {
    if (!this.canvasMasVendidos) return;
    
    // Destruir gráfico anterior si existe
    if (this.chartMasVendidos) {
      this.chartMasVendidos.destroy();
    }
    
    const top5 = this.productosMasVendidos.slice(0, 5);
    
    if (top5.length === 0) return;
    
    const ctx = this.canvasMasVendidos.nativeElement.getContext('2d');
    if (!ctx) return;
    
    this.chartMasVendidos = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top5.map(p => p.nombre.length > 20 ? p.nombre.substring(0, 20) + '...' : p.nombre),
        datasets: [{
          label: 'Ingresos',
          data: top5.map(p => p.ingresosGenerados),
          backgroundColor: 'rgba(99, 129, 228, 0.6)',
          borderColor: '#6381e4',
          borderWidth: 2
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: true,
            callbacks: {
              label: (context) => {
                const value = context.parsed.x;
                if (value === null || value === undefined) return '';
                return new Intl.NumberFormat('es-CL', {
                  style: 'currency',
                  currency: 'CLP',
                  minimumFractionDigits: 0
                }).format(value);
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: function(value: any) {
                return new Intl.NumberFormat('es-CL', {
                  style: 'currency',
                  currency: 'CLP',
                  minimumFractionDigits: 0
                }).format(value);
              }
            }
          }
        }
      }
    });
  }
  
  abrirModalExportar(): void {
    this.mostrandoModalExportar = true;
  }
  
  cerrarModalExportar(): void {
    this.mostrandoModalExportar = false;
  }
  
  async exportarReporte(): Promise<void> {
    if (this.estaExportando) return;
    
    this.estaExportando = true;
    
    try {
      if (this.formatoExportar === 'excel') {
        await this.exportarExcel();
      } else {
        await this.exportarPDF();
      }
      
      this.mostrarToast('Reporte exportado exitosamente', 'success');
      this.cerrarModalExportar();
    } catch (error) {
      console.error('Error al exportar:', error);
      this.mostrarToast('Error al exportar el reporte', 'danger');
    } finally {
      this.estaExportando = false;
    }
  }
  
  async exportarExcel(): Promise<void> {
    const workbook = XLSX.utils.book_new();
    
    if (this.tipoReporteExportar === 'general' || this.tipoReporteExportar === 'todos') {
      // Hoja 1: Resumen General
      const datosResumen = [
        ['Período', this.obtenerNombrePeriodo()],
        ['Total de Ventas', this.cantidadVentas],
        ['Total Ingresos', this.formatearPrecio(this.totalVentas)],
        ['Promedio por Venta', this.formatearPrecio(this.promedioVenta)],
        [''],
        ['Fecha', 'ID Venta', 'Total', 'Método de Pago', 'Productos']
      ];
      
      this.ventasFiltradas.forEach(venta => {
        const fechaVenta = venta.fecha instanceof Timestamp 
          ? venta.fecha.toDate() 
          : new Date(venta.fecha);
        datosResumen.push([
          fechaVenta.toLocaleDateString('es-CL'),
          venta.id,
          venta.total,
          this.obtenerNombreMetodoPago(venta.metodoPago),
          venta.productos.map(p => `${p.nombre} (x${p.cantidad})`).join(', ')
        ]);
      });
      
      const wsResumen = XLSX.utils.aoa_to_sheet(datosResumen);
      XLSX.utils.book_append_sheet(workbook, wsResumen, 'Resumen General');
    }
    
    if (this.tipoReporteExportar === 'masVendidos' || this.tipoReporteExportar === 'todos') {
      // Hoja 2: Productos Más Vendidos
      const datosMasVendidos = [
        ['Producto', 'Cantidad Vendida', 'Ingresos Generados']
      ];
      
      this.productosMasVendidos.forEach(producto => {
        datosMasVendidos.push([
          producto.nombre,
          producto.cantidadVendida.toString(),
          producto.ingresosGenerados.toString()
        ]);
      });
      
      const wsMasVendidos = XLSX.utils.aoa_to_sheet(datosMasVendidos);
      XLSX.utils.book_append_sheet(workbook, wsMasVendidos, 'Más Vendidos');
    }
    
    if (this.tipoReporteExportar === 'menosVendidos' || this.tipoReporteExportar === 'todos') {
      // Hoja 3: Productos Menos Vendidos
      const datosMenosVendidos = [
        ['Producto', 'Cantidad Vendida', 'Ingresos Generados']
      ];
      
      this.productosMenosVendidos.forEach(producto => {
        datosMenosVendidos.push([
          producto.nombre,
          producto.cantidadVendida.toString(),
          producto.ingresosGenerados.toString()
        ]);
      });
      
      const wsMenosVendidos = XLSX.utils.aoa_to_sheet(datosMenosVendidos);
      XLSX.utils.book_append_sheet(workbook, wsMenosVendidos, 'Menos Vendidos');
    }
    
    const nombreArchivo = `Reporte_${this.obtenerNombrePeriodo()}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, nombreArchivo);
  }
  
  async exportarPDF(): Promise<void> {
    const doc = new jsPDF();
    
    let yPos = 20;
    
    // Título
    doc.setFontSize(18);
    doc.text('Reporte de Ventas - Zypos', 14, yPos);
    yPos += 10;
    
    doc.setFontSize(12);
    doc.text(`Período: ${this.obtenerNombrePeriodo()}`, 14, yPos);
    yPos += 15;
    
    if (this.tipoReporteExportar === 'general' || this.tipoReporteExportar === 'todos') {
      // Resumen
      doc.setFontSize(14);
      doc.text('Resumen General', 14, yPos);
      yPos += 10;
      
      const datosResumen = [
        ['Total de Ventas', this.cantidadVentas.toString()],
        ['Total Ingresos', this.formatearPrecio(this.totalVentas)],
        ['Promedio por Venta', this.formatearPrecio(this.promedioVenta)]
      ];
      
      autoTable(doc, {
        startY: yPos,
        head: [['Métrica', 'Valor']],
        body: datosResumen,
        theme: 'striped',
        headStyles: { fillColor: [248, 149, 133] }
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 15;
      
      // Tabla de ventas
      if (this.ventasFiltradas.length > 0) {
        doc.setFontSize(14);
        doc.text('Detalle de Ventas', 14, yPos);
        yPos += 10;
        
        const datosVentas = this.ventasFiltradas.slice(0, 50).map(venta => {
          const fechaVenta = venta.fecha instanceof Timestamp 
            ? venta.fecha.toDate() 
            : new Date(venta.fecha);
          return [
            fechaVenta.toLocaleDateString('es-CL'),
            venta.id.substring(0, 8),
            this.formatearPrecio(venta.total),
            this.obtenerNombreMetodoPago(venta.metodoPago)
          ];
        });
        
        autoTable(doc, {
          startY: yPos,
          head: [['Fecha', 'ID', 'Total', 'Método']],
          body: datosVentas,
          theme: 'striped',
          headStyles: { fillColor: [248, 149, 133] }
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }
    }
    
    if (this.tipoReporteExportar === 'masVendidos' || this.tipoReporteExportar === 'todos') {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(14);
      doc.text('Productos Más Vendidos', 14, yPos);
      yPos += 10;
      
      const datosMasVendidos = this.productosMasVendidos.map(p => [
        p.nombre.length > 30 ? p.nombre.substring(0, 30) + '...' : p.nombre,
        p.cantidadVendida.toString(),
        this.formatearPrecio(p.ingresosGenerados)
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Producto', 'Cantidad', 'Ingresos']],
        body: datosMasVendidos,
        theme: 'striped',
        headStyles: { fillColor: [99, 129, 228] }
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 15;
    }
    
    if (this.tipoReporteExportar === 'menosVendidos' || this.tipoReporteExportar === 'todos') {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(14);
      doc.text('Productos Menos Vendidos', 14, yPos);
      yPos += 10;
      
      const datosMenosVendidos = this.productosMenosVendidos.map(p => [
        p.nombre.length > 30 ? p.nombre.substring(0, 30) + '...' : p.nombre,
        p.cantidadVendida.toString(),
        this.formatearPrecio(p.ingresosGenerados)
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Producto', 'Cantidad', 'Ingresos']],
        body: datosMenosVendidos,
        theme: 'striped',
        headStyles: { fillColor: [99, 129, 228] }
      });
    }
    
    const nombreArchivo = `Reporte_${this.obtenerNombrePeriodo()}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(nombreArchivo);
  }
  
  formatearPrecio(precio: number): string {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(precio);
  }
  
  obtenerNombrePeriodo(): string {
    switch (this.periodoSeleccionado) {
      case 'dia':
        return 'Día';
      case 'semana':
        return 'Semana';
      case 'mes':
        return 'Mes';
      default:
        return 'Período';
    }
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
  
  obtenerTextoReporte(tipo: string): string {
    switch (tipo) {
      case 'todos':
        return 'Todos los Reportes';
      case 'general':
        return 'Resumen General';
      case 'masVendidos':
        return 'Productos Más Vendidos';
      case 'menosVendidos':
        return 'Productos Menos Vendidos';
      default:
        return 'Selecciona un tipo';
    }
  }
  
  obtenerTextoFormato(formato: string): string {
    switch (formato) {
      case 'excel':
        return 'Excel (.xlsx)';
      case 'pdf':
        return 'PDF (.pdf)';
      default:
        return 'Selecciona un formato';
    }
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
