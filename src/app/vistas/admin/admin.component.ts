import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, ToastController, IonModal, IonButtons, IonTitle, IonSearchbar, IonBadge, AlertController } from '@ionic/angular/standalone';
import { arrowBack, people, barChart, settings, logOut, search, checkmark, close, save, calendar, cash, timeOutline, create, trash, download, document } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, Timestamp } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonButton, IonIcon, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, CommonModule, ReactiveFormsModule, FormsModule, IonModal, IonButtons, IonTitle, IonSearchbar, IonBadge]
})
export class AdminComponent implements OnInit {
  verificandoAuth: boolean = true;
  clientes: any[] = [];
  clientesFiltrados: any[] = [];
  estaCargando: boolean = false;
  terminoBusqueda: string = '';
  
  mostrandoModalPlan: boolean = false;
  mostrandoModalCliente: boolean = false;
  mostrandoModalInforme: boolean = false;
  clienteEditando: any = null;
  formularioPlan!: FormGroup;
  formularioCliente!: FormGroup;
  formatoInforme: 'pdf' | 'excel' = 'pdf';
  estaGenerandoInforme: boolean = false;
  
  estadisticas: any = {
    totalClientes: 0,
    clientesActivos: 0,
    clientesFree: 0,
    clientesPlus: 0,
    ingresosMensuales: 0
  };

  constructor(
    private router: Router,
    private firestore: Firestore,
    private formBuilder: FormBuilder,
    private toastController: ToastController,
    private alertController: AlertController
  ) {
    addIcons({ arrowBack, people, barChart, settings, logOut, search, checkmark, close, save, calendar, cash, timeOutline, create, trash, download, document });
  }

  async ngOnInit() {
    // Verificar sesión de administrador
    const sesionAdmin = sessionStorage.getItem('zypos_sesion_administrador');
    if (!sesionAdmin) {
      this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
      return;
    }

    this.verificandoAuth = false;
    this.inicializarFormulario();
    await this.cargarClientes();
    this.calcularEstadisticas();
  }

  inicializarFormulario() {
    this.formularioPlan = this.formBuilder.group({
      plan: ['free', [Validators.required]],
      fechaInicio: ['', [Validators.required]],
      fechaVencimiento: ['', [Validators.required]],
      estado: ['activa', [Validators.required]]
    });
    
    this.formularioCliente = this.formBuilder.group({
      nombre: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      rut: ['', [Validators.required]]
    });
  }

  async cargarClientes() {
    this.estaCargando = true;
    try {
      const usuariosRef = collection(this.firestore, 'usuarios');
      const q = query(usuariosRef, orderBy('creacion', 'desc'));
      const querySnapshot = await getDocs(q);
      
      this.clientes = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          nombre: data['nombre'] || 'Sin nombre',
          email: data['email'] || 'Sin email',
          rut: data['rut'] || 'Sin RUT',
          creacion: data['creacion'] || null,
          suscripcion: data['suscripcion'] || null,
          emailVerificado: data['emailVerificado'] || false
        };
      });
      
      this.clientesFiltrados = [...this.clientes];
    } catch (error: any) {
      console.error('Error al cargar clientes:', error);
      this.mostrarToast('Error al cargar los clientes', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  calcularEstadisticas() {
    this.estadisticas.totalClientes = this.clientes.length;
    this.estadisticas.clientesActivos = this.clientes.filter(c => {
      const suscripcion = c.suscripcion;
      if (!suscripcion) return false;
      if (suscripcion.estado !== 'activa') return false;
      if (suscripcion.vence) {
        const fechaVence = suscripcion.vence.toDate();
        return fechaVence >= new Date();
      }
      return false;
    }).length;
    
    this.estadisticas.clientesFree = this.clientes.filter(c => c.suscripcion?.nombre === 'free').length;
    this.estadisticas.clientesPlus = this.clientes.filter(c => c.suscripcion?.nombre === 'plus').length;
  }

  onBuscar(event: any) {
    this.terminoBusqueda = event.detail.value || '';
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    if (!this.terminoBusqueda.trim()) {
      this.clientesFiltrados = [...this.clientes];
      return;
    }

    const busqueda = this.terminoBusqueda.toLowerCase().trim();
    this.clientesFiltrados = this.clientes.filter(cliente => {
      const nombre = (cliente.nombre || '').toLowerCase();
      const email = (cliente.email || '').toLowerCase();
      const rut = (cliente.rut || '').toLowerCase();
      return nombre.includes(busqueda) || email.includes(busqueda) || rut.includes(busqueda);
    });
  }

  abrirModalEditarPlan(cliente: any) {
    this.clienteEditando = cliente;
    const suscripcion = cliente.suscripcion || {};
    
    let fechaInicio = '';
    let fechaVencimiento = '';
    
    if (suscripcion.fechaInicio) {
      const fechaInicioDate = suscripcion.fechaInicio.toDate();
      fechaInicio = fechaInicioDate.toISOString().split('T')[0];
    }
    
    if (suscripcion.vence) {
      const fechaVenceDate = suscripcion.vence.toDate();
      fechaVencimiento = fechaVenceDate.toISOString().split('T')[0];
    }
    
    this.formularioPlan.patchValue({
      plan: suscripcion.nombre || 'free',
      fechaInicio: fechaInicio,
      fechaVencimiento: fechaVencimiento,
      estado: suscripcion.estado || 'activa'
    });
    
    this.mostrandoModalPlan = true;
  }

  abrirModalEditarCliente(cliente: any) {
    this.clienteEditando = cliente;
    this.formularioCliente.patchValue({
      nombre: cliente.nombre || '',
      email: cliente.email || '',
      rut: cliente.rut || ''
    });
    this.mostrandoModalCliente = true;
  }

  cerrarModal() {
    this.mostrandoModalPlan = false;
    this.mostrandoModalCliente = false;
    this.clienteEditando = null;
    this.inicializarFormulario();
  }

  async guardarPlan() {
    if (this.formularioPlan.invalid || !this.clienteEditando) {
      this.formularioPlan.markAllAsTouched();
      return;
    }

    this.estaCargando = true;
    try {
      const valores = this.formularioPlan.value;
      const fechaInicio = Timestamp.fromDate(new Date(valores.fechaInicio));
      const fechaVencimiento = Timestamp.fromDate(new Date(valores.fechaVencimiento));
      
      await updateDoc(doc(this.firestore, 'usuarios', this.clienteEditando.id), {
        suscripcion: {
          nombre: valores.plan,
          fechaInicio: fechaInicio,
          vence: fechaVencimiento,
          estado: valores.estado
        }
      });
      
      this.mostrarToast('Plan actualizado exitosamente', 'success');
      await this.cargarClientes();
      this.calcularEstadisticas();
      this.cerrarModal();
    } catch (error: any) {
      console.error('Error al actualizar plan:', error);
      this.mostrarToast('Error al actualizar el plan', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  async guardarCliente() {
    if (this.formularioCliente.invalid || !this.clienteEditando) {
      this.formularioCliente.markAllAsTouched();
      return;
    }

    this.estaCargando = true;
    try {
      const valores = this.formularioCliente.value;
      const rutLimpio = this.limpiarRut(valores.rut);
      
      await updateDoc(doc(this.firestore, 'usuarios', this.clienteEditando.id), {
        nombre: valores.nombre.trim(),
        email: valores.email.toLowerCase().trim(),
        rut: rutLimpio
      });
      
      this.mostrarToast('Cliente actualizado exitosamente', 'success');
      await this.cargarClientes();
      this.calcularEstadisticas();
      this.cerrarModal();
    } catch (error: any) {
      console.error('Error al actualizar cliente:', error);
      this.mostrarToast('Error al actualizar el cliente', 'danger');
    } finally {
      this.estaCargando = false;
    }
  }

  limpiarRut(rut: string): string {
    return rut.replace(/[^0-9kK]/g, '').toUpperCase();
  }

  async eliminarCliente(cliente: any) {
    if (!cliente.id) return;

    const alert = await this.alertController.create({
      header: 'Eliminar Cliente',
      message: `¿Estás seguro de eliminar al cliente "${cliente.nombre}"? Esta acción eliminará permanentemente todos los datos del cliente y no se puede deshacer.`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            this.estaCargando = true;
            try {
              await deleteDoc(doc(this.firestore, 'usuarios', cliente.id));
              this.mostrarToast('Cliente eliminado exitosamente', 'success');
              await this.cargarClientes();
              this.calcularEstadisticas();
            } catch (error: any) {
              console.error('Error al eliminar cliente:', error);
              this.mostrarToast('Error al eliminar el cliente', 'danger');
            } finally {
              this.estaCargando = false;
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async cerrarSesion() {
    const alert = await this.alertController.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que deseas cerrar sesión?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Cerrar Sesión',
          handler: () => {
            sessionStorage.removeItem('zypos_sesion_administrador');
            sessionStorage.removeItem('zypos_admin_email');
            this.router.navigate(['/iniciar-sesion'], { replaceUrl: true });
          }
        }
      ]
    });
    await alert.present();
  }

  formatearFecha(timestamp: any): string {
    if (!timestamp) return 'No especificada';
    try {
      const fecha = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return fecha.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (error) {
      return 'Fecha inválida';
    }
  }

  obtenerEstadoSuscripcion(cliente: any): string {
    const suscripcion = cliente.suscripcion;
    if (!suscripcion || suscripcion.estado !== 'activa') {
      return 'inactiva';
    }
    if (suscripcion.vence) {
      const fechaVence = suscripcion.vence.toDate();
      if (fechaVence < new Date()) {
        return 'vencida';
      }
    }
    return 'activa';
  }

  async mostrarToast(mensaje: string, color: string = 'danger') {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 4000,
      position: 'top',
      color: color
    });
    await toast.present();
  }

  abrirModalInforme() {
    this.mostrandoModalInforme = true;
  }

  cerrarModalInforme() {
    this.mostrandoModalInforme = false;
  }

  async generarInforme() {
    if (this.estaGenerandoInforme) return;

    this.estaGenerandoInforme = true;
    try {
      if (this.formatoInforme === 'pdf') {
        await this.exportarPDF();
      } else {
        await this.exportarExcel();
      }
      this.mostrarToast('Informe generado exitosamente', 'success');
      this.cerrarModalInforme();
    } catch (error: any) {
      console.error('Error al generar informe:', error);
      this.mostrarToast('Error al generar el informe', 'danger');
    } finally {
      this.estaGenerandoInforme = false;
    }
  }

  async exportarPDF() {
    const doc = new jsPDF();
    let yPos = 20;

    // Título
    doc.setFontSize(18);
    doc.text('Informe de Estadísticas - Zypos', 14, yPos);
    yPos += 10;

    doc.setFontSize(12);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`, 14, yPos);
    yPos += 15;

    // Resumen de Estadísticas
    doc.setFontSize(14);
    doc.text('Resumen de Estadísticas', 14, yPos);
    yPos += 10;

    const datosResumen = [
      ['Total de Clientes', this.estadisticas.totalClientes.toString()],
      ['Clientes Activos', this.estadisticas.clientesActivos.toString()],
      ['Plan Free', this.estadisticas.clientesFree.toString()],
      ['Plan Plus', this.estadisticas.clientesPlus.toString()],
      ['Ingresos Mensuales', this.formatearPrecio(this.estadisticas.ingresosMensuales)]
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Métrica', 'Valor']],
      body: datosResumen,
      theme: 'striped',
      headStyles: { fillColor: [56, 128, 255] }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Lista de Clientes
    if (this.clientes.length > 0) {
      doc.setFontSize(14);
      doc.text('Lista de Clientes', 14, yPos);
      yPos += 10;

      const datosClientes = this.clientes.map(cliente => {
        const fechaCreacion = cliente.creacion 
          ? (cliente.creacion.toDate ? cliente.creacion.toDate() : new Date(cliente.creacion))
          : null;
        const fechaVence = cliente.suscripcion?.vence
          ? (cliente.suscripcion.vence.toDate ? cliente.suscripcion.vence.toDate() : new Date(cliente.suscripcion.vence))
          : null;

        return [
          cliente.nombre || 'Sin nombre',
          cliente.email || 'Sin email',
          cliente.rut || 'Sin RUT',
          cliente.suscripcion?.nombre || 'Sin plan',
          cliente.suscripcion?.estado || 'Sin estado',
          fechaVence ? fechaVence.toLocaleDateString('es-ES') : 'Sin fecha',
          fechaCreacion ? fechaCreacion.toLocaleDateString('es-ES') : 'Sin fecha',
          cliente.emailVerificado ? 'Sí' : 'No'
        ];
      });

      autoTable(doc, {
        startY: yPos,
        head: [['Nombre', 'Email', 'RUT', 'Plan', 'Estado', 'Vence', 'Registro', 'Email Verificado']],
        body: datosClientes,
        theme: 'striped',
        headStyles: { fillColor: [56, 128, 255] },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 40 },
          2: { cellWidth: 25 },
          3: { cellWidth: 20 },
          4: { cellWidth: 20 },
          5: { cellWidth: 25 },
          6: { cellWidth: 25 },
          7: { cellWidth: 25 }
        }
      });
    }

    const nombreArchivo = `Informe_Estadisticas_Zypos_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(nombreArchivo);
  }

  async exportarExcel() {
    const workbook = XLSX.utils.book_new();

    // Hoja de Resumen
    const datosResumen = [
      ['Métrica', 'Valor'],
      ['Total de Clientes', this.estadisticas.totalClientes],
      ['Clientes Activos', this.estadisticas.clientesActivos],
      ['Plan Free', this.estadisticas.clientesFree],
      ['Plan Plus', this.estadisticas.clientesPlus],
      ['Ingresos Mensuales', this.estadisticas.ingresosMensuales]
    ];

    const hojaResumen = XLSX.utils.aoa_to_sheet(datosResumen);
    XLSX.utils.book_append_sheet(workbook, hojaResumen, 'Resumen');

    // Hoja de Clientes
    const datosClientes = [
      ['Nombre', 'Email', 'RUT', 'Plan', 'Estado', 'Fecha Vencimiento', 'Fecha Registro', 'Email Verificado']
    ];

    this.clientes.forEach(cliente => {
      const fechaCreacion = cliente.creacion 
        ? (cliente.creacion.toDate ? cliente.creacion.toDate() : new Date(cliente.creacion))
        : null;
      const fechaVence = cliente.suscripcion?.vence
        ? (cliente.suscripcion.vence.toDate ? cliente.suscripcion.vence.toDate() : new Date(cliente.suscripcion.vence))
        : null;

      datosClientes.push([
        cliente.nombre || 'Sin nombre',
        cliente.email || 'Sin email',
        cliente.rut || 'Sin RUT',
        cliente.suscripcion?.nombre || 'Sin plan',
        cliente.suscripcion?.estado || 'Sin estado',
        fechaVence ? fechaVence.toLocaleDateString('es-ES') : 'Sin fecha',
        fechaCreacion ? fechaCreacion.toLocaleDateString('es-ES') : 'Sin fecha',
        cliente.emailVerificado ? 'Sí' : 'No'
      ]);
    });

    const hojaClientes = XLSX.utils.aoa_to_sheet(datosClientes);
    XLSX.utils.book_append_sheet(workbook, hojaClientes, 'Clientes');

    const nombreArchivo = `Informe_Estadisticas_Zypos_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, nombreArchivo);
  }

  formatearPrecio(valor: number): string {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(valor);
  }
}

