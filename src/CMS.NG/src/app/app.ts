import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

interface MenuItem {
  label: string;
  icon: string;
  route?: string;
  /** Level-3 children. An item with children is a collapsible group (no route). */
  children?: MenuItem[];
  /** Expand state for a group item. */
  expanded?: boolean;
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

  // Ultima-style sidebar. Three levels are supported:
  //   section title (L1) → item (L2) → item.children (L3).
  // An item with `children` renders as a collapsible group; an item with `route`
  // renders as a link; an item with neither is a placeholder.
  protected readonly menu = signal<MenuSection[]>([
    {
      title: '功能選單',
      items: [
        {
          label: '首頁管理 Home',
          icon: 'pi pi-home',
          expanded: true,
          children: [
            {
              label: '上稿作業 FeaturedPromoItem',
              icon: 'pi pi-calendar',
              route: '/featured-promo-items',
            },
          ],
        },
        {
          // Level-2 collapsible group → level-3 links.
          label: '課程管理 Course',
          icon: 'pi pi-book',
          expanded: true,
          children: [
            { label: '合作廠商 Partner', icon: 'pi pi-building', route: '/partners' },
            { label: '課程群組 CourseGroup', icon: 'pi pi-sitemap', route: '/course-groups' },
          ],
        },
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
        {
          // Level-2 collapsible group → level-3 links.
          label: '使用者與角色 Access',
          icon: 'pi pi-users',
          expanded: true,
          children: [
            { label: '角色 AppRole', icon: 'pi pi-id-card', route: '/app-roles' },
            { label: '使用者 AppUser', icon: 'pi pi-user', route: '/app-users' },
          ],
        },
        { label: '發布狀態 PublishStatus', icon: 'pi pi-flag', route: '/publish-statuses' },
      ],
    },
  ]);

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  toggleItem(item: MenuItem): void {
    if (!item.children?.length) {
      return;
    }
    item.expanded = !item.expanded;
    // Force the signal to re-emit so the template re-renders the mutated item.
    this.menu.update((sections) => [...sections]);
  }
}
