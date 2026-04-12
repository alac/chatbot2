import { UIManager } from './ui/UIManager.js';
import { SettingsMenu } from './ui/SettingsMenu.js';
import { settings } from './state/AppSettings.js';

document.addEventListener('DOMContentLoaded', () => {
    // Apply init visual settings
    document.documentElement.setAttribute('data-theme', settings.theme);

    const uiManager = new UIManager();
    
    // Attach to window so SettingsMenu can call UI functions
    window.settingsUI = new SettingsMenu(uiManager);
});