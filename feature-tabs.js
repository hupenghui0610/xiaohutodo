export function createFeatureTabs({ tabs, panels, weekNav, todoLegend }) {
  function activate(tabName) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.featureTab === tabName;
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('tabindex', selected ? '0' : '-1');
    });

    Object.entries(panels).forEach(([name, panel]) => {
      panel.hidden = name !== tabName;
    });
    const todoActive = tabName === 'todo';
    weekNav.hidden = !todoActive;
    todoLegend.hidden = !todoActive;
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.dataset.featureTab));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const nextTab = tabs[(index + offset + tabs.length) % tabs.length];
      activate(nextTab.dataset.featureTab);
      nextTab.focus();
    });
  });

  activate('todo');
  return { activate };
}

export function initFeatureTabs(root = document) {
  const tabs = [...root.querySelectorAll('[data-feature-tab]')];
  return createFeatureTabs({
    tabs,
    panels: {
      todo: root.getElementById('todoPanel'),
      documents: root.getElementById('documentsPanel'),
    },
    weekNav: root.getElementById('weekNav'),
    todoLegend: root.getElementById('todoLegend'),
  });
}

if (typeof document !== 'undefined') {
  initFeatureTabs(document);
}
