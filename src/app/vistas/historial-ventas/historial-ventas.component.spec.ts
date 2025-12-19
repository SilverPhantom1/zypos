import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { HistorialVentasComponent } from './historial-ventas.component';

describe('HistorialVentasComponent', () => {
  let component: HistorialVentasComponent;
  let fixture: ComponentFixture<HistorialVentasComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [HistorialVentasComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HistorialVentasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

