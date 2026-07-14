import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

interface NavItem {
  label: string;
  icon: string;
  route?: string;
}

interface NavGroup {
  label: string;
  icon: string;
  expanded?: boolean;
  children: NavItem[];
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

  // Sidebar navigation. Only 角色 AppRole is wired to a route in this first feature;
  // add new features under the matching group here (see spec/code-gen.convention.md).
  protected readonly navGroups = signal<NavGroup[]>([
    { label: '首頁管理 Home', icon: 'pi pi-home', children: [] },
    { label: '課程管理 Course', icon: 'pi pi-folder', children: [] },
    { label: '說明會 Seminar', icon: 'pi pi-comments', children: [] },
    { label: '活動管理 Promotion', icon: 'pi pi-megaphone', children: [] },
    { label: '線上報名 Forms', icon: 'pi pi-file-edit', children: [] },
    { label: '網站資訊 WebInfo', icon: 'pi pi-globe', children: [] },
    { label: '考試中心 TestingCenter', icon: 'pi pi-verified', children: [] },
    {
      label: '系統管理 Admin',
      icon: 'pi pi-shield',
      expanded: true,
      children: [
        { label: '角色 AppRole', icon: 'pi pi-id-card', route: '/app-roles' },
        { label: '使用者 AppUser', icon: 'pi pi-user' },
      ],
    },
  ]);

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  toggleGroup(group: NavGroup): void {
    if (group.children.length === 0) {
      return;
    }
    group.expanded = !group.expanded;
    this.navGroups.update((groups) => [...groups]);
  }
}
