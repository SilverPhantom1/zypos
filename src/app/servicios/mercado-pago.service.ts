import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MercadoPagoService {
  private vercelUrl: string;

  constructor(
    private router: Router
  ) {
    this.vercelUrl = environment.vercelUrl || 'https://zypos.vercel.app';
  }

  async crearPreferenciaPago(
    monto: number,
    descripcion: string,
    userId: string,
    planId: string
  ): Promise<string> {
    try {
      const baseUrl = window.location.origin;

      const response = await fetch(`${this.vercelUrl}/api/crear-preferencia-pago`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          monto,
          descripcion,
          userId,
          planId,
          baseUrl
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error al crear preferencia de pago:', errorData);
        throw new Error(errorData.error || 'Error al crear preferencia de pago');
      }

      const data = await response.json();

      if (!data.init_point) {
        throw new Error('No se obtuvo la URL del checkout');
      }

      return data.init_point;

    } catch (error: any) {
      console.error('Error al crear preferencia de pago:', error);
      throw error;
    }
  }

  async procesarPagoPlan(
    monto: number,
    descripcion: string,
    userId: string,
    planId: string
  ): Promise<void> {
    try {
      const checkoutUrl = await this.crearPreferenciaPago(monto, descripcion, userId, planId);
      window.location.href = checkoutUrl;
    } catch (error: any) {
      console.error('Error al procesar pago:', error);
      throw error;
    }
  }
}

