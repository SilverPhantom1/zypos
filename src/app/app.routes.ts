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
    path: 'home',
    loadComponent: () => import('./vistas/home/home.component').then(m => m.HomeComponent)
  }
];
