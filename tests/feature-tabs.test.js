import assert from 'node:assert/strict';
import test from 'node:test';

import { createFeatureTabs } from '../feature-tabs.js';

class FakeElement {
  constructor(featureTab = '') {
    this.dataset = { featureTab };
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.focused = false;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type, event = {}) {
    this.listeners.get(type)?.({ preventDefault() {}, ...event });
  }

  focus() {
    this.focused = true;
  }
}

function setup() {
  const todoTab = new FakeElement('todo');
  const documentsTab = new FakeElement('documents');
  const todoPanel = new FakeElement();
  const documentsPanel = new FakeElement();
  const weekNav = new FakeElement();
  const directoryManageBtn = new FakeElement();
  let documentsActivatedCount = 0;

  createFeatureTabs({
    tabs: [todoTab, documentsTab],
    panels: { todo: todoPanel, documents: documentsPanel },
    weekNav,
    directoryManageBtn,
    onDocumentsActivated: () => { documentsActivatedCount += 1; },
  });

  return {
    todoTab,
    documentsTab,
    todoPanel,
    documentsPanel,
    weekNav,
    directoryManageBtn,
    get documentsActivatedCount() { return documentsActivatedCount; },
  };
}

test('defaults to the todo tab and exposes only todo controls', () => {
  const ui = setup();

  assert.equal(ui.todoTab.getAttribute('aria-selected'), 'true');
  assert.equal(ui.todoTab.getAttribute('tabindex'), '0');
  assert.equal(ui.documentsTab.getAttribute('aria-selected'), 'false');
  assert.equal(ui.documentsTab.getAttribute('tabindex'), '-1');
  assert.equal(ui.todoPanel.hidden, false);
  assert.equal(ui.documentsPanel.hidden, true);
  assert.equal(ui.weekNav.hidden, false);
  assert.equal(ui.directoryManageBtn.hidden, true);
});

test('clicking documents switches panels and hides week navigation', () => {
  const ui = setup();

  ui.documentsTab.dispatch('click');

  assert.equal(ui.todoTab.getAttribute('aria-selected'), 'false');
  assert.equal(ui.documentsTab.getAttribute('aria-selected'), 'true');
  assert.equal(ui.todoPanel.hidden, true);
  assert.equal(ui.documentsPanel.hidden, false);
  assert.equal(ui.weekNav.hidden, true);
  assert.equal(ui.directoryManageBtn.hidden, false);
  assert.equal(ui.documentsActivatedCount, 0);

  ui.todoTab.dispatch('click');
  assert.equal(ui.todoPanel.hidden, false);
  assert.equal(ui.documentsPanel.hidden, true);
  assert.equal(ui.weekNav.hidden, false);
  assert.equal(ui.directoryManageBtn.hidden, true);

  ui.documentsTab.dispatch('click');
  assert.equal(ui.documentsActivatedCount, 0);
});

test('arrow keys activate and focus the adjacent tab', () => {
  const ui = setup();

  ui.todoTab.dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(ui.documentsTab.focused, true);
  assert.equal(ui.documentsTab.getAttribute('aria-selected'), 'true');

  ui.documentsTab.dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(ui.todoTab.focused, true);
  assert.equal(ui.todoTab.getAttribute('aria-selected'), 'true');
});
