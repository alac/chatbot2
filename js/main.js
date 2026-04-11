import { UIManager } from './ui/UIManager.js';
import { SettingsMenu } from './ui/SettingsMenu.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize the Settings Menu
    const settingsMenu = new SettingsMenu();
    
    // Initialize the Main UI Controller
    const uiManager = new UIManager();
    
    console.log("Modular AI Frontend Initialized.");
});