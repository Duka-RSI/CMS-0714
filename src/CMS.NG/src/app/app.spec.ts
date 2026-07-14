import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService, ConfirmationService } from 'primeng/api';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        MessageService,
        ConfirmationService,
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the UWA brand', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.logo-text')?.textContent).toContain('UWA');
  });

  it('should render the Admin section with a 角色 AppRole link', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const text = compiled.textContent ?? '';
    expect(text).toContain('系統管理 Admin');
    expect(text).toContain('角色 AppRole');

    const sectionTitles = Array.from(compiled.querySelectorAll('.menu-section-title')).map(
      (el) => el.textContent?.trim(),
    );
    expect(sectionTitles).toContain('系統管理 Admin');

    const appRoleLink = Array.from(compiled.querySelectorAll('a.menu-item')).find((a) =>
      a.textContent?.includes('角色 AppRole'),
    );
    expect(appRoleLink?.getAttribute('href')).toContain('/app-roles');
  });
});
