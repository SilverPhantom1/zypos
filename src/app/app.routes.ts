import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'registrarse',
    pathMatch: 'full'
  },
  {
    path: 'registrarse',
    loadComponent: () => import('./vistas/auth/registrarse/registrarse.component').then(m => m.RegistrarseComponent)
  },
  {
    path: 'iniciar-sesion',
    loadComponent: () => import('./vistas/auth/iniciar-sesion/iniciar-sesion.component').then(m => m.IniciarSesionComponent)
  },
  {
    path: 'recuperar-contrasena',
    loadComponent: () => import('./vistas/auth/recuperar-contrasena/recuperar-contrasena.component').then(m => m.RecuperarContrasenaComponent)
  },
  {
    path: 'nueva-contrasena',
    loadComponent: () => import('./vistas/auth/nueva-contrasena/nueva-contrasena.component').then(m => m.NuevaContrasenaComponent)
  },
  {
    path: 'home',
    loadComponent: () => import('./vistas/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'planes',
    loadComponent: () => import('./vistas/planes/planes.component').then(m => m.PlanesComponent)
  },
  {
    path: 'gestion-suscripcion',
    loadComponent: () => import('./vistas/gestion-suscripcion/gestion-suscripcion.component').then(m => m.GestionSuscripcionComponent)
  },
  {
    path: 'perfil',
    loadComponent: () => import('./vistas/perfil/perfil.component').then(m => m.PerfilComponent)
  },
  {
    path: 'inventario',
    loadComponent: () => import('./vistas/inventario/inventario.component').then(m => m.InventarioComponent)
  },
  {
    path: 'proveedores',
    loadComponent: () => import('./vistas/proveedores/proveedores.component').then(m => m.ProveedoresComponent)
  },
  {
    path: 'ventas',
    loadComponent: () => import('./vistas/ventas/ventas.component').then(m => m.VentasComponent)
  },
  {
    path: 'historial-ventas',
    loadComponent: () => import('./vistas/historial-ventas/historial-ventas.component').then(m => m.HistorialVentasComponent)
  },
  {
    path: 'informes',
    loadComponent: () => import('./vistas/informes/informes.component').then(m => m.InformesComponent)
  },
  {
    path: 'gestion-trabajadores',
    loadComponent: () => import('./vistas/gestion-trabajadores/gestion-trabajadores.component').then(m => m.GestionTrabajadoresComponent)
  }
];
