import { UIManager } from './ui/UIManager.js';
import { SettingsMenu } from './ui/SettingsMenu.js';

document.addEventListener('DOMContentLoaded', () => {
    const uiManager = new UIManager();
    
    // Attach to window so SettingsMenu can call UI functions
    window.settingsUI = new SettingsMenu(uiManager);
});