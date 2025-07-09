// background.js - Gmail Ethical Content Detector Extension

class EthicsDetectorBackground {
    constructor() {
        this.settings = {
            realtimeScanning: false,
            phishingDetection: true,
            spamDetection: true,
            biasDetection: true,
            hateSpeechDetection: true,
            sensitivityLevel: 3,
            autoBlock: false,
            notifications: true,
            blockList: [],
            whiteList: []
        };

        this.stats = {
            emailsScanned: 0,
            threatsBlocked: 0,
            biasDetected: 0,
            totalSessions: 0,
            lastScanTime: null,
            dailyStats: {}
        };

        this.activeTabs = new Map();
        this.scanQueue = [];
        this.isProcessing = false;
        this.threatDatabase = new Map();
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadStats();
        await this.initThreatDatabase();
        this.setupEventListeners();
        this.startPeriodicTasks();
        this.updateBadge();
        
        console.log('Gmail Ethical Content Detector initialized');
    }

    setupEventListeners() {
        // Extension lifecycle events
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstall(details);
        });

        chrome.runtime.onStartup.addListener(() => {
            this.handleStartup();
        });

        // Tab events
        chrome.tabs.onActivated.addListener((activeInfo) => {
            this.handleTabActivated(activeInfo);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdated(tabId, changeInfo, tab);
        });

        chrome.tabs.onRemoved.addListener((tabId) => {
            this.handleTabRemoved(tabId);
        });

        // Message handling
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });

        // Alarm events for periodic tasks
        chrome.alarms.onAlarm.addListener((alarm) => {
            this.handleAlarm(alarm);
        });

        // Storage changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            this.handleStorageChanged(changes, namespace);
        });
    }

    async handleInstall(details) {
        if (details.reason === 'install') {
            // First time installation
            await this.initializeDefaultSettings();
            this.showWelcomeNotification();
            
            // Set up periodic alarms
            chrome.alarms.create('updateThreatDatabase', { periodInMinutes: 60 });
            chrome.alarms.create('dailyStatsReset', { periodInMinutes: 1440 }); // 24 hours
            
        } else if (details.reason === 'update') {
            // Extension updated
            await this.migrateSettings(details.previousVersion);
            this.showUpdateNotification();
        }
    }

    async handleStartup() {
        this.stats.totalSessions++;
        await this.saveStats();
        console.log('Extension started - Session:', this.stats.totalSessions);
    }

    async handleTabActivated(activeInfo) {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        this.checkGmailTab(tab);
    }

    async handleTabUpdated(tabId, changeInfo, tab) {
        if (changeInfo.status === 'complete' && tab.url) {
            this.checkGmailTab(tab);
        }
    }

    handleTabRemoved(tabId) {
        this.activeTabs.delete(tabId);
        this.updateBadge();
    }

    async checkGmailTab(tab) {
        if (tab.url && tab.url.includes('mail.google.com')) {
            this.activeTabs.set(tab.id, {
                url: tab.url,
                lastScan: null,
                threats: 0,
                isMonitoring: this.settings.realtimeScanning
            });
            
            // Inject content script if not already present
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                
                // Send current settings to content script
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'initializeSettings',
                    settings: this.settings
                });
                
            } catch (error) {
                console.error('Failed to inject content script:', error);
            }
        } else {
            this.activeTabs.delete(tab.id);
        }
        
        this.updateBadge();
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'scanEmail':
                    const result = await this.processEmailScan(request.emailData, sender.tab.id);
                    sendResponse({ success: true, results: result });
                    break;

                case 'updateSettings':
                    await this.updateSettings(request.settings);
                    sendResponse({ success: true });
                    break;

                case 'getStats':
                    sendResponse({ success: true, stats: this.stats });
                    break;

                case 'reportThreat':
                    await this.reportThreat(request.threatData, sender.tab.id);
                    sendResponse({ success: true });
                    break;

                case 'blockSender':
                    await this.blockSender(request.senderEmail);
                    sendResponse({ success: true });
                    break;

                case 'whitelistSender':
                    await this.whitelistSender(request.senderEmail);
                    sendResponse({ success: true });
                    break;

                case 'getRealtimeStatus':
                    sendResponse({ 
                        success: true, 
                        enabled: this.settings.realtimeScanning,
                        tabMonitored: this.activeTabs.has(sender.tab.id)
                    });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async processEmailScan(emailData, tabId) {
        const results = [];
        
        // Check if sender is blocked or whitelisted
        if (this.settings.blockList.includes(emailData.sender)) {
            results.push({
                type: 'blocked',
                severity: 'high',
                message: `Sender ${emailData.sender} is blocked`,
                action: 'block'
            });
        }

        if (this.settings.whiteList.includes(emailData.sender)) {
            results.push({
                type: 'whitelisted',
                severity: 'none',
                message: `Sender ${emailData.sender} is whitelisted`,
                action: 'allow'
            });
        }

        // Run detection algorithms
        if (this.settings.phishingDetection) {
            const phishingResults = await this.detectPhishing(emailData);
            results.push(...phishingResults);
        }

        if (this.settings.spamDetection) {
            const spamResults = await this.detectSpam(emailData);
            results.push(...spamResults);
        }

        if (this.settings.biasDetection) {
            const biasResults = await this.detectBias(emailData);
            results.push(...biasResults);
        }

        if (this.settings.hateSpeechDetection) {
            const hateSpeechResults = await this.detectHateSpeech(emailData);
            results.push(...hateSpeechResults);
        }

        // Update statistics
        await this.updateScanStats(results, tabId);

        // Send notifications if enabled
        if (this.settings.notifications) {
            await this.sendNotifications(results, emailData);
        }

        return results;
    }

    async detectPhishing(emailData) {
        const results = [];
        const suspiciousPatterns = [
            /urgent.{0,20}action.{0,20}required/i,
            /verify.{0,20}account/i,
            /click.{0,20}here.{0,20}immediately/i,
            /suspended.{0,20}account/i,
            /limited.{0,20}time/i
        ];

        const suspiciousUrls = [
            /bit\.ly/i,
            /tinyurl/i,
            /shortened\.link/i
        ];

        // Check content for suspicious patterns
        const content = emailData.body + ' ' + emailData.subject;
        let suspiciousCount = 0;

        suspiciousPatterns.forEach(pattern => {
            if (pattern.test(content)) {
                suspiciousCount++;
            }
        });

        // Check URLs
        if (emailData.links) {
            emailData.links.forEach(link => {
                suspiciousUrls.forEach(pattern => {
                    if (pattern.test(link)) {
                        suspiciousCount++;
                    }
                });
            });
        }

        // Check against threat database
        if (this.threatDatabase.has(emailData.sender)) {
            const threat = this.threatDatabase.get(emailData.sender);
            if (threat.type === 'phishing') {
                results.push({
                    type: 'phishing',
                    severity: 'high',
                    message: `Known phishing sender: ${emailData.sender}`,
                    confidence: threat.confidence
                });
            }
        }

        // Determine severity based on suspicious count and sensitivity
        if (suspiciousCount > 0) {
            const severity = this.calculateSeverity(suspiciousCount, this.settings.sensitivityLevel);
            results.push({
                type: 'phishing',
                severity: severity,
                message: `Potential phishing detected (${suspiciousCount} suspicious indicators)`,
                confidence: Math.min(suspiciousCount * 0.3, 0.9)
            });
        }

        return results;
    }

    async detectSpam(emailData) {
        const results = [];
        const spamKeywords = [
            'winner', 'congratulations', 'prize', 'lottery', 'free money',
            'make money fast', 'work from home', 'no experience required',
            'limited time offer', 'act now', 'click here now'
        ];

        const content = (emailData.body + ' ' + emailData.subject).toLowerCase();
        let spamScore = 0;

        spamKeywords.forEach(keyword => {
            if (content.includes(keyword)) {
                spamScore += 1;
            }
        });

        // Check for excessive capitalization
        const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
        if (capsRatio > 0.3) {
            spamScore += 2;
        }

        // Check for excessive punctuation
        const punctuationRatio = (content.match(/[!?]{2,}/g) || []).length;
        if (punctuationRatio > 3) {
            spamScore += 1;
        }

        if (spamScore > 0) {
            const severity = this.calculateSeverity(spamScore, this.settings.sensitivityLevel);
            results.push({
                type: 'spam',
                severity: severity,
                message: `Potential spam detected (score: ${spamScore})`,
                confidence: Math.min(spamScore * 0.2, 0.8)
            });
        }

        return results;
    }

    async detectBias(emailData) {
        const results = [];
        const biasPatterns = [
            /all (men|women|muslims|christians|jews|blacks|whites|asians|hispanics)/i,
            /(men|women|muslims|christians|jews|blacks|whites|asians|hispanics) are/i,
            /typical (man|woman|muslim|christian|jew|black|white|asian|hispanic)/i
        ];

        const content = emailData.body + ' ' + emailData.subject;
        let biasCount = 0;

        biasPatterns.forEach(pattern => {
            if (pattern.test(content)) {
                biasCount++;
            }
        });

        if (biasCount > 0) {
            const severity = this.calculateSeverity(biasCount, this.settings.sensitivityLevel);
            results.push({
                type: 'bias',
                severity: severity,
                message: `Potential bias detected (${biasCount} indicators)`,
                confidence: Math.min(biasCount * 0.4, 0.7)
            });
        }

        return results;
    }

    async detectHateSpeech(emailData) {
        const results = [];
        const hateSpeechPatterns = [
            /hate/i,
            /kill/i,
            /die/i,
            /threat/i
        ];

        const content = emailData.body + ' ' + emailData.subject;
        let hateScore = 0;

        hateSpeechPatterns.forEach(pattern => {
            if (pattern.test(content)) {
                hateScore++;
            }
        });

        if (hateScore > 0) {
            const severity = this.calculateSeverity(hateScore, this.settings.sensitivityLevel);
            results.push({
                type: 'hate_speech',
                severity: severity,
                message: `Potential hate speech detected (${hateScore} indicators)`,
                confidence: Math.min(hateScore * 0.3, 0.8)
            });
        }

        return results;
    }

    calculateSeverity(score, sensitivity) {
        const threshold = 6 - sensitivity; // Higher sensitivity = lower threshold
        
        if (score >= threshold * 2) return 'high';
        if (score >= threshold) return 'medium';
        return 'low';
    }

    async updateScanStats(results, tabId) {
        this.stats.emailsScanned++;
        this.stats.lastScanTime = Date.now();

        const threats = results.filter(r => r.severity === 'high' || r.severity === 'medium');
        const biasIssues = results.filter(r => r.type === 'bias');

        this.stats.threatsBlocked += threats.length;
        this.stats.biasDetected += biasIssues.length;

        // Update tab-specific stats
        if (this.activeTabs.has(tabId)) {
            const tabData = this.activeTabs.get(tabId);
            tabData.threats += threats.length;
            tabData.lastScan = Date.now();
        }

        // Update daily stats
        const today = new Date().toDateString();
        if (!this.stats.dailyStats[today]) {
            this.stats.dailyStats[today] = {
                scanned: 0,
                threats: 0,
                bias: 0
            };
        }

        this.stats.dailyStats[today].scanned++;
        this.stats.dailyStats[today].threats += threats.length;
        this.stats.dailyStats[today].bias += biasIssues.length;

        await this.saveStats();
        this.updateBadge();
    }

    async sendNotifications(results, emailData) {
        const highSeverityThreats = results.filter(r => r.severity === 'high');
        
        if (highSeverityThreats.length > 0) {
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Ethics Detector Alert',
                message: `High-risk content detected in email from ${emailData.sender}`,
                priority: 2
            });
        }
    }

    async updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        await this.saveSettings();
        
        // Broadcast settings to all Gmail tabs
        for (const tabId of this.activeTabs.keys()) {
            try {
                await chrome.tabs.sendMessage(tabId, {
                    action: 'updateSettings',
                    settings: this.settings
                });
            } catch (error) {
                console.error('Failed to update settings for tab:', tabId, error);
            }
        }
    }

    async blockSender(senderEmail) {
        if (!this.settings.blockList.includes(senderEmail)) {
            this.settings.blockList.push(senderEmail);
            await this.saveSettings();
        }
    }

    async whitelistSender(senderEmail) {
        if (!this.settings.whiteList.includes(senderEmail)) {
            this.settings.whiteList.push(senderEmail);
            await this.saveSettings();
        }
    }

    updateBadge() {
        const totalThreats = Array.from(this.activeTabs.values())
            .reduce((sum, tab) => sum + tab.threats, 0);

        chrome.action.setBadgeText({
            text: totalThreats > 0 ? totalThreats.toString() : ''
        });

        chrome.action.setBadgeBackgroundColor({
            color: totalThreats > 0 ? '#f44336' : '#4CAF50'
        });
    }

    async handleAlarm(alarm) {
        switch (alarm.name) {
            case 'updateThreatDatabase':
                await this.updateThreatDatabase();
                break;
            case 'dailyStatsReset':
                await this.resetDailyStats();
                break;
        }
    }

    async updateThreatDatabase() {
        // In a real implementation, this would fetch from a threat intelligence API
        console.log('Updating threat database...');
        
        // Simulate updating threat database
        const mockThreats = [
            { email: 'phisher@example.com', type: 'phishing', confidence: 0.9 },
            { email: 'spammer@example.com', type: 'spam', confidence: 0.8 }
        ];

        mockThreats.forEach(threat => {
            this.threatDatabase.set(threat.email, threat);
        });
    }

    async resetDailyStats() {
        // Keep only last 30 days of stats
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        Object.keys(this.stats.dailyStats).forEach(date => {
            if (new Date(date) < thirtyDaysAgo) {
                delete this.stats.dailyStats[date];
            }
        });

        await this.saveStats();
    }

    async handleStorageChanged(changes, namespace) {
        if (namespace === 'sync' && changes.ethicsSettings) {
            this.settings = changes.ethicsSettings.newValue;
        }
    }

    startPeriodicTasks() {
        // Set up alarms for periodic tasks
        chrome.alarms.create('updateThreatDatabase', { periodInMinutes: 60 });
        chrome.alarms.create('dailyStatsReset', { periodInMinutes: 1440 });
    }

    async initializeDefaultSettings() {
        await this.saveSettings();
        await this.saveStats();
    }

    async initThreatDatabase() {
        // Initialize with some basic threat patterns
        this.threatDatabase.set('no-reply@suspicious.com', {
            type: 'phishing',
            confidence: 0.8
        });
    }

    async migrateSettings(previousVersion) {
        // Handle settings migration for updates
        console.log('Migrating settings from version:', previousVersion);
    }

    showWelcomeNotification() {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Gmail Ethics Detector Installed',
            message: 'Your email protection is now active. Click the extension icon to configure settings.'
        });
    }

    showUpdateNotification() {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Gmail Ethics Detector Updated',
            message: 'New features and improvements are now available.'
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

    async reportThreat(threatData, tabId) {
        // In a real implementation, this would report to a threat intelligence service
        console.log('Reporting threat:', threatData);
        
        // Add to local threat database
        this.threatDatabase.set(threatData.sender, {
            type: threatData.type,
            confidence: threatData.confidence || 0.7,
            reportedAt: Date.now()
        });
    }
}

// Initialize the background service
const ethicsDetector = new EthicsDetectorBackground();