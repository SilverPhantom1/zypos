import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CloudinaryService {
  constructor() {
    // Verificar que las credenciales estén configuradas
    if (!environment.cloudinary?.cloudName || !environment.cloudinary?.uploadPreset) {
      console.warn('Cloudinary no está configurado correctamente. Verifica las variables de entorno.');
    }
  }

  /**
   * Sube una imagen a Cloudinary
   * @param file Archivo de imagen a subir
   * @param folder Carpeta donde se guardará (opcional)
   * @param userId ID del usuario para organizar las imágenes (opcional)
   * @returns Promise con la URL de la imagen subida
   */
  async subirImagen(file: File, folder: string = 'zypos/productos', userId?: string): Promise<string> {
    if (!environment.cloudinary?.cloudName || !environment.cloudinary?.uploadPreset) {
      throw new Error('Cloudinary no está configurado. Verifica las variables de entorno.');
    }

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', environment.cloudinary.uploadPreset);
      
      // Construir la ruta de la carpeta
      let folderPath = folder;
      if (userId) {
        folderPath = `${folder}/${userId}`;
      }
      if (folderPath) {
        formData.append('folder', folderPath);
      }

      // NO enviar transformación aquí - estaba causando el error 400 "Invalid transformation component"
      // Si necesitas transformaciones, configúralas en el preset de Cloudinary

      // Usar la API de upload de Cloudinary directamente desde el cliente
      fetch(`https://api.cloudinary.com/v1_1/${environment.cloudinary.cloudName}/image/upload`, {
        method: 'POST',
        body: formData
      })
        .then(response => {
          if (!response.ok) {
            return response.json().then(err => {
              throw new Error(err.error?.message || 'Error al subir la imagen');
            });
          }
          return response.json();
        })
        .then(data => {
          if (data.error) {
            reject(new Error(data.error.message));
          } else {
            resolve(data.secure_url);
          }
        })
        .catch(error => {
          console.error('Error al subir imagen a Cloudinary:', error);
          reject(error);
        });
    });
  }

  /**
   * Elimina una imagen de Cloudinary usando su URL pública
   * @param imageUrl URL pública de la imagen
   * @returns Promise que se resuelve cuando la imagen es eliminada
   */
  async eliminarImagen(imageUrl: string): Promise<void> {
    try {
      // Extraer el public_id de la URL
      const publicId = this.extraerPublicId(imageUrl);
      if (!publicId) {
        throw new Error('No se pudo extraer el public_id de la URL');
      }

      // Para eliminar desde el cliente, necesitamos usar una función de servidor
      // o usar signed URLs. Por ahora, retornamos una promesa resuelta
      // ya que la eliminación debería hacerse desde el servidor por seguridad
      console.warn('La eliminación de imágenes debe hacerse desde el servidor por seguridad');
      return Promise.resolve();
    } catch (error) {
      console.error('Error al eliminar imagen:', error);
      throw error;
    }
  }

  /**
   * Extrae el public_id de una URL de Cloudinary
   * @param url URL de Cloudinary
   * @returns public_id o null si no se puede extraer
   */
  private extraerPublicId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const versionIndex = pathParts.findIndex(part => part.match(/^v\d+$/));
      
      if (versionIndex !== -1 && versionIndex < pathParts.length - 1) {
        const publicIdParts = pathParts.slice(versionIndex + 1);
        const publicId = publicIdParts.join('/').replace(/\.[^/.]+$/, '');
        return publicId;
      }
      return null;
    } catch (error) {
      console.error('Error al extraer public_id:', error);
      return null;
    }
  }

  /**
   * Genera una URL optimizada de Cloudinary
   * @param imageUrl URL original de Cloudinary
   * @param options Opciones de transformación
   * @returns URL optimizada
   */
  obtenerUrlOptimizada(imageUrl: string, options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
  } = {}): string {
    try {
      const publicId = this.extraerPublicId(imageUrl);
      if (!publicId) {
        return imageUrl; // Retornar URL original si no se puede procesar
      }

      const transformations: string[] = [];
      if (options.width) transformations.push(`w_${options.width}`);
      if (options.height) transformations.push(`h_${options.height}`);
      if (options.quality) transformations.push(`q_${options.quality}`);
      if (options.format) transformations.push(`f_${options.format}`);

      const cloudName = environment.cloudinary?.cloudName || '';
      const transformString = transformations.length > 0 ? transformations.join(',') + '/' : '';
      
      return `https://res.cloudinary.com/${cloudName}/image/upload/${transformString}${publicId}.${options.format || 'jpg'}`;
    } catch (error) {
      console.error('Error al generar URL optimizada:', error);
      return imageUrl;
    }
  }
}

