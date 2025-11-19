import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { NuevaContrasenaComponent } from './nueva-contrasena.component';

describe('NuevaContrasenaComponent', () => {
  let component: NuevaContrasenaComponent;
  let fixture: ComponentFixture<NuevaContrasenaComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [NuevaContrasenaComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NuevaContrasenaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
