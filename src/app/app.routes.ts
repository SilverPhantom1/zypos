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
    path: 'home',
    loadComponent: () => import('./vistas/home/home.component').then(m => m.HomeComponent)
  }
];
