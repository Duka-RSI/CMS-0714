import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

interface MenuItem {
  label: string;
  icon: string;
  route?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastModule, ConfirmDialogModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('UWA');
  protected readonly sidebarCollapsed = signal(false);

  // Ultima-style sidebar: uppercase section headers + item rows.
  // Only 角色 AppRole is wired to a route in this first feature; add new features
  // under the matching section here (see spec/code-gen.convention.md).
  protected readonly menu = signal<MenuSection[]>([
    {
      title: '功能選單',
      items: [
        { label: '首頁管理 Home', icon: 'pi pi-home' },
        { label: '課程管理 Course', icon: 'pi pi-book' },
        { label: '說明會 Seminar', icon: 'pi pi-comments' },
        { label: '活動管理 Promotion', icon: 'pi pi-megaphone' },
        { label: '線上報名 Forms', icon: 'pi pi-file-edit' },
        { label: '網站資訊 WebInfo', icon: 'pi pi-globe' },
        { label: '考試中心 TestingCenter', icon: 'pi pi-verified' },
      ],
    },
    {
      title: '系統管理 Admin',
      items: [
        { label: '角色 AppRole', icon: 'pi pi-id-card', route: '/app-roles' },
        { label: '使用者 AppUser', icon: 'pi pi-user' },
      ],
    },
  ]);

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }
}
