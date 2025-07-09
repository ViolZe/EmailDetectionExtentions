// popup.js - Gmail Ethical Content Detector Extension

class EthicalContentDetector {
    constructor() {
        this.settings = {
            realtimeScanning: false,
            phishingDetection: true,
            spamDetection: true,
            biasDetection: true,
            hateSpeechDetection: true,
            sensitivityLevel: 3,
            autoBlock: false,
            notifications: true
        };
        
        this.stats = {
            emailsScanned: 0,
            threatsBlocked: 0,
            biasDetected: 0,
            totalSessions: 0
        };
        
        this.isScanning = false;
        this.currentTab = null;
        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadStats();
        this.setupEventListeners();
        this.updateUI();
        this.checkGmailConnection();
    }

    setupEventListeners() {
        // Toggle switches
        document.getElementById('realtimeToggle')?.addEventListener('click', () => {
            this.toggleSetting('realtimeScanning');
        });

        document.getElementById('phishingToggle')?.addEventListener('click', () => {
            this.toggleSetting('phishingDetection');
        });

        document.getElementById('spamToggle')?.addEventListener('click', () => {
            this.toggleSetting('spamDetection');
        });

        document.getElementById('biasToggle')?.addEventListener('click', () => {
            this.toggleSetting('biasDetection');
        });

        document.getElementById('hateSpeechToggle')?.addEventListener('click', () => {
            this.toggleSetting('hateSpeechDetection');
        });

        // Sensitivity slider
        document.getElementById('sensitivitySlider')?.addEventListener('input', (e) => {
            this.settings.sensitivityLevel = parseInt(e.target.value);
            this.saveSettings();
            this.updateStatusIndicator();
        });

        // Main scan button
        document.getElementById('scanButton')?.addEventListener('click', () => {
            this.performScan();
        });

        // Settings button
        document.getElementById('settingsButton')?.addEventListener('click', () => {
            this.openSettings();
        });

        // Clear data button
        document.getElementById('clearDataButton')?.addEventListener('click', () => {
            this.clearAllData();
        });
    }

    async loadSettings() {
        try {
            const stored = await chrome.storage.sync.get('ethicsSettings');
            if (stored.ethicsSettings) {
                this.settings = { ...this.settings, ...stored.ethicsSettings };
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.sync.set({ ethicsSettings: this.settings });
            // Notify content script of settings change
            this.sendMessageToContentScript({ 
                action: 'updateSettings', 
                settings: this.settings 
            });
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    async loadStats() {
        try {
            const stored = await chrome.storage.local.get('ethicsStats');
            if (stored.ethicsStats) {
                this.stats = { ...this.stats, ...stored.ethicsStats };
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    async saveStats() {
        try {
            await chrome.storage.local.set({ ethicsStats: this.stats });
        } catch (error) {
            console.error('Failed to save stats:', error);
        }
    }

    toggleSetting(settingName) {
        this.settings[settingName] = !this.settings[settingName];
        this.saveSettings();
        this.updateToggleUI(settingName);
        this.updateStatusIndicator();
        
        // Send setting update to content script
        this.sendMessageToContentScript({
            action: 'toggleSetting',
            setting: settingName,
            value: this.settings[settingName]
        });
    }

    updateToggleUI(settingName) {
        const toggleMap = {
            'realtimeScanning': 'realtimeToggle',
            'phishingDetection': 'phishingToggle',
            'spamDetection': 'spamToggle',
            'biasDetection': 'biasToggle',
            'hateSpeechDetection': 'hateSpeechToggle'
        };

        const toggleElement = document.getElementById(toggleMap[settingName]);
        if (toggleElement) {
            if (this.settings[settingName]) {
                toggleElement.classList.add('active');
            } else {
                toggleElement.classList.remove('active');
            }
        }
    }

    updateStatusIndicator() {
        const indicator = document.getElementById('statusIndicator');
        if (!indicator) return;

        const activeFeatures = Object.entries(this.settings)
            .filter(([key, value]) => key !== 'sensitivityLevel' && value).length;
        
        if (this.settings.realtimeScanning && activeFeatures > 2) {
            indicator.className = 'status-indicator';
        } else if (activeFeatures > 1) {
            indicator.className = 'status-indicator warning';
        } else {
            indicator.className = 'status-indicator disabled';
        }
    }

    updateUI() {
        // Update all toggle switches
        Object.keys(this.settings).forEach(settingName => {
            if (settingName !== 'sensitivityLevel') {
                this.updateToggleUI(settingName);
            }
        });

        // Update sensitivity slider
        const slider = document.getElementById('sensitivitySlider');
        if (slider) {
            slider.value = this.settings.sensitivityLevel;
        }

        // Update status indicator
        this.updateStatusIndicator();

        // Update stats
        this.updateStatsDisplay();
    }

    updateStatsDisplay() {
        const elements = {
            emailsScanned: document.getElementById('emailsScanned'),
            threatsBlocked: document.getElementById('threatsBlocked'),
            biasDetected: document.getElementById('biasDetected')
        };

        Object.entries(elements).forEach(([key, element]) => {
            if (element) {
                element.textContent = this.stats[key] || 0;
            }
        });
    }

    async checkGmailConnection() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;
            
            if (tab.url && tab.url.includes('mail.google.com')) {
                this.showConnectedState();
            } else {
                this.showDisconnectedState();
            }
        } catch (error) {
            console.error('Failed to check Gmail connection:', error);
            this.showDisconnectedState();
        }
    }

    showConnectedState() {
        const scanButton = document.getElementById('scanButton');
        if (scanButton) {
            scanButton.textContent = 'Scan Current Email';
            scanButton.disabled = false;
        }
    }

    showDisconnectedState() {
        const scanButton = document.getElementById('scanButton');
        if (scanButton) {
            scanButton.textContent = 'Open Gmail to Scan';
            scanButton.disabled = true;
        }
    }

    async performScan() {
        if (this.isScanning) return;
        
        this.isScanning = true;
        this.showLoadingState();

        try {
            // Send scan request to content script
            const response = await this.sendMessageToContentScript({
                action: 'scanCurrentEmail',
                settings: this.settings
            });

            if (response && response.success) {
                this.displayResults(response.results);
                this.updateStatsAfterScan(response.results);
            } else {
                this.displayError('Failed to scan email. Please try again.');
            }
        } catch (error) {
            console.error('Scan failed:', error);
            this.displayError('Scan failed. Make sure you are on Gmail.');
        } finally {
            this.isScanning = false;
            this.hideLoadingState();
        }
    }

    showLoadingState() {
        const loadingSection = document.getElementById('loadingSection');
        const scanButton = document.getElementById('scanButton');
        const resultsSection = document.getElementById('resultsSection');
        
        if (loadingSection) loadingSection.classList.add('active');
        if (scanButton) scanButton.disabled = true;
        if (resultsSection) resultsSection.style.display = 'none';
    }

    hideLoadingState() {
        const loadingSection = document.getElementById('loadingSection');
        const scanButton = document.getElementById('scanButton');
        
        if (loadingSection) loadingSection.classList.remove('active');
        if (scanButton) scanButton.disabled = false;
    }

    displayResults(results) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsList = document.getElementById('resultsList');
        
        if (!resultsSection || !resultsList) return;

        resultsList.innerHTML = '';
        
        results.forEach(result => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            
            const iconClass = this.getResultIconClass(result.severity);
            const icon = this.getResultIcon(result.severity);
            
            resultItem.innerHTML = `
                <div class="result-icon ${iconClass}">${icon}</div>
                <div class="result-text">${result.message}</div>
            `;
            
            resultsList.appendChild(resultItem);
        });
        
        resultsSection.style.display = 'block';
    }

    getResultIconClass(severity) {
        switch (severity) {
            case 'high': return 'error';
            case 'medium': return 'warning';
            case 'low': return 'warning';
            default: return 'clean';
        }
    }

    getResultIcon(severity) {
        switch (severity) {
            case 'high': return '✗';
            case 'medium': return '!';
            case 'low': return '◐';
            default: return '✓';
        }
    }

    displayError(message) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsList = document.getElementById('resultsList');
        
        if (!resultsSection || !resultsList) return;

        resultsList.innerHTML = `
            <div class="result-item">
                <div class="result-icon error">✗</div>
                <div class="result-text">${message}</div>
            </div>
        `;
        
        resultsSection.style.display = 'block';
    }

    updateStatsAfterScan(results) {
        this.stats.emailsScanned++;
        
        const threats = results.filter(r => r.severity === 'high' || r.severity === 'medium');
        const biasIssues = results.filter(r => r.type === 'bias');
        
        this.stats.threatsBlocked += threats.length;
        this.stats.biasDetected += biasIssues.length;
        
        this.saveStats();
        this.updateStatsDisplay();
    }

    async sendMessageToContentScript(message) {
        try {
            if (!this.currentTab) return null;
            
            const response = await chrome.tabs.sendMessage(this.currentTab.id, message);
            return response;
        } catch (error) {
            console.error('Failed to send message to content script:', error);
            return null;
        }
    }

    openSettings() {
        chrome.runtime.openOptionsPage();
    }

    async clearAllData() {
        if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            try {
                await chrome.storage.local.clear();
                await chrome.storage.sync.clear();
                
                // Reset to defaults
                this.stats = {
                    emailsScanned: 0,
                    threatsBlocked: 0,
                    biasDetected: 0,
                    totalSessions: 0
                };
                
                this.updateStatsDisplay();
                this.showNotification('All data cleared successfully');
            } catch (error) {
                console.error('Failed to clear data:', error);
                this.showNotification('Failed to clear data');
            }
        }
    }

    showNotification(message) {
        // Create a simple notification in the popup
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #4CAF50;
            color: white;
            padding: 10px 15px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Listen for messages from content script
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'updateStats') {
                this.stats = { ...this.stats, ...request.stats };
                this.saveStats();
                this.updateStatsDisplay();
            } else if (request.action === 'showNotification') {
                this.showNotification(request.message);
            }
        });
    }
}

// Initialize the detector when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new EthicalContentDetector();
});

// Handle popup closing
window.addEventListener('beforeunload', () => {
    // Save any pending data
    console.log('Popup closing - saving data');
});