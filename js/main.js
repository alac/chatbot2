import { UIManager } from './ui/UIManager.js';
import { SettingsMenu } from './ui/SettingsMenu.js';

document.addEventListener('DOMContentLoaded', () => {
    const settingsMenu = new SettingsMenu();
    const uiManager = new UIManager();
});