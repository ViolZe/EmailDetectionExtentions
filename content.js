class GmailEthicalDetector {
    constructor() {
        this.apiEndpoint = 'http://localhost:5000/analyze';
        this.isEnabled = true;
        this.settings = {
            sensitivity: 0.6,
            blockSending: true,
            showSuggestions: true,
            checkIncoming: true
        };
        
        this.init();
    }

    async init() {
        console.log('🔎 Gmail Ethical Content Detector starting...');
        
        // Load settings from Chrome storage
        await this.loadSettings();
        
        // Wait for Gmail to fully load
        await this.waitForGmail();
        
        // Setup the extension
        this.setupUI();
        this.monitorCompose();
        this.monitorInbox();
        
        console.log('✅ Gmail Ethical Content Detector initialized');
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['detectorSettings']);
            if (result.detectorSettings) {
                this.settings = { ...this.settings, ...result.detectorSettings };
            }
        } catch (error) {
            console.log('Using default settings');
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.sync.set({ detectorSettings: this.settings });
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    waitForGmail() {
        return new Promise((resolve) => {
            const checkGmail = () => {
                // Check if Gmail interface is loaded
                if (document.querySelector('[data-tooltip="Compose"]') || 
                    document.querySelector('[gh="cm"]') ||
                    document.querySelector('div[role="main"]')) {
                    resolve();
                } else {
                    setTimeout(checkGmail, 1000);
                }
            };
            checkGmail();
        });
    }

    setupUI() {
        // Create floating control panel
        this.createControlPanel();
        
        // Add custom CSS styles
        this.addStyles();
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
    }

    createControlPanel() {
        // Remove existing panel if any
        const existingPanel = document.getElementById('ethical-detector-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.id = 'ethical-detector-panel';
        panel.innerHTML = `
            <div class="detector-header">
                <span class="detector-icon">🔎</span>
                <span class="detector-title">Ethical Detector</span>
                <button class="detector-toggle" id="detector-toggle">
                    ${this.isEnabled ? 'ON' : 'OFF'}
                </button>
            </div>
            <div class="detector-stats" id="detector-stats">
                <span>Emails analyzed: 0</span>
                <span>Warnings: 0</span>
            </div>
        `;

        // Position the panel
        panel.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10000;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            font-family: 'Google Sans', Roboto, Arial, sans-serif;
            font-size: 12px;
            min-width: 200px;
        `;

        document.body.appendChild(panel);

        // Add event listeners
        document.getElementById('detector-toggle').addEventListener('click', () => {
            this.toggleDetector();
        });

        // Make panel draggable
        this.makeDraggable(panel);
    }

    makeDraggable(element) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        element.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('detector-toggle')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = element.offsetLeft;
            initialY = element.offsetTop;
            
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
        });

        function drag(e) {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            element.style.left = (initialX + dx) + 'px';
            element.style.top = (initialY + dy) + 'px';
            element.style.right = 'auto';
        }

        function stopDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
        }
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .detector-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
                padding-bottom: 6px;
                border-bottom: 1px solid #f0f0f0;
            }
            
            .detector-icon {
                font-size: 16px;
                margin-right: 6px;
            }
            
            .detector-title {
                font-weight: 500;
                color: #333;
                flex-grow: 1;
            }
            
            .detector-toggle {
                background: #4CAF50;
                color: white;
                border: none;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 500;
            }
            
            .detector-toggle.disabled {
                background: #f44336;
            }
            
            .detector-stats {
                display: flex;
                justify-content: space-between;
                color: #666;
                font-size: 10px;
            }
            
            .ethical-warning {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-left: 4px solid #fdcb6e;
                padding: 12px;
                margin: 8px 0;
                border-radius: 4px;
                font-family: 'Google Sans', Roboto, Arial, sans-serif;
                font-size: 13px;
                line-height: 1.4;
            }
            
            .ethical-warning.high {
                background: #ffebee;
                border-color: #ffcdd2;
                border-left-color: #f44336;
            }
            
            .ethical-warning.medium {
                background: #fff3e0;
                border-color: #ffcc02;
                border-left-color: #ff9800;
            }
            
            .ethical-suggestion {
                background: #e8f5e8;
                border: 1px solid #c8e6c9;
                border-left: 4px solid #4caf50;
                padding: 10px;
                margin: 6px 0;
                border-radius: 4px;
                font-size: 12px;
            }
            
            .ethical-suggestion ul {
                margin: 8px 0 0 0;
                padding-left: 16px;
            }
            
            .ethical-suggestion li {
                margin: 4px 0;
                color: #2e7d32;
            }
            
            .warning-header {
                font-weight: 500;
                color: #d32f2f;
                margin-bottom: 6px;
            }
            
            .warning-details {
                color: #666;
                font-size: 11px;
                margin-top: 6px;
            }
            
            .send-block-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border: 2px solid #f44336;
                border-radius: 8px;
                padding: 20px;
                z-index: 20000;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                max-width: 500px;
                width: 90%;
            }
            
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 19999;
            }
            
            .modal-buttons {
                display: flex;
                gap: 10px;
                margin-top: 15px;
                justify-content: flex-end;
            }
            
            .modal-button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
            }
            
            .modal-button.cancel {
                background: #f44336;
                color: white;
            }
            
            .modal-button.send {
                background: #4caf50;
                color: white;
            }
        `;
        document.head.appendChild(style);
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+E to toggle detector
            if (e.ctrlKey && e.shiftKey && e.key === 'E') {
                e.preventDefault();
                this.toggleDetector();
            }
        });
    }

    monitorCompose() {
        // Use MutationObserver to watch for new compose windows
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Look for compose areas with different selectors
                        const composeSelectors = [
                            '[contenteditable="true"][aria-label*="Message Body"]',
                            '[contenteditable="true"][aria-label*="message body"]',
                            '[contenteditable="true"][role="textbox"]',
                            'div[contenteditable="true"]'
                        ];
                        
                        composeSelectors.forEach(selector => {
                            const composeArea = node.querySelector ? node.querySelector(selector) : null;
                            if (composeArea && !composeArea.dataset.ethicalDetectorMonitored) {
                                this.setupComposeMonitoring(composeArea);
                            }
                        });
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also check existing compose areas
        this.checkExistingComposeAreas();
    }

    checkExistingComposeAreas() {
        const composeSelectors = [
            '[contenteditable="true"][aria-label*="Message Body"]',
            '[contenteditable="true"][aria-label*="message body"]',
            '[contenteditable="true"][role="textbox"]'
        ];
        
        composeSelectors.forEach(selector => {
            const composeAreas = document.querySelectorAll(selector);
            composeAreas.forEach(area => {
                if (!area.dataset.ethicalDetectorMonitored) {
                    this.setupComposeMonitoring(area);
                }
            });
        });
    }

    setupComposeMonitoring(composeArea) {
        if (!composeArea || composeArea.dataset.ethicalDetectorMonitored) return;
        
        composeArea.dataset.ethicalDetectorMonitored = 'true';
        
        // Create warning container
        const warningContainer = document.createElement('div');
        warningContainer.className = 'ethical-warnings-container';
        
        // Insert warning container before compose area
        composeArea.parentNode.insertBefore(warningContainer, composeArea);

        let analysisTimeout;
        
        // Monitor typing
        composeArea.addEventListener('input', () => {
            if (!this.isEnabled) return;
            
            clearTimeout(analysisTimeout);
            analysisTimeout = setTimeout(() => {
                const content = this.getEmailContent(composeArea);
                this.analyzeContent(content, warningContainer, 'compose');
            }, 1500); // Analyze 1.5 seconds after user stops typing
        });

        // Monitor send button
        this.interceptSendButton(composeArea, warningContainer);
    }

    getEmailContent(composeArea) {
        // Get text content, handling different Gmail formats
        const textContent = composeArea.innerText || composeArea.textContent || '';
        
        // Remove quoted text (lines starting with >)
        const lines = textContent.split('\n');
        const filteredLines = lines.filter(line => !line.trim().startsWith('>'));
        
        return filteredLines.join('\n').trim();
    }

    interceptSendButton(composeArea, warningContainer) {
        // Look for send button with multiple possible selectors
        const sendSelectors = [
            '[data-tooltip*="Send"]',
            '[aria-label*="Send"]',
            'div[role="button"][data-tooltip*="Send"]',
            'div[data-tooltip="Send ‪(Ctrl+Enter)‬"]'
        ];
        
        const findAndInterceptSend = () => {
            sendSelectors.forEach(selector => {
                const sendButtons = document.querySelectorAll(selector);
                sendButtons.forEach(button => {
                    if (!button.dataset.ethicalDetectorIntercepted) {
                        button.dataset.ethicalDetectorIntercepted = 'true';
                        
                        button.addEventListener('click', (e) => {
                            const content = this.getEmailContent(composeArea);
                            this.handleSendAttempt(content, e, warningContainer);
                        });
                    }
                });
            });
        };

        // Initial check
        findAndInterceptSend();
        
        // Keep checking for send buttons (they might be added dynamically)
        setInterval(findAndInterceptSend, 2000);
    }

    async handleSendAttempt(content, event, warningContainer) {
        if (!this.isEnabled || !content || content.length < 5) return;

        try {
            const result = await this.callAPI(content);
            
            if (result.is_toxic && result.confidence > this.settings.sensitivity) {
                event.preventDefault();
                event.stopPropagation();
                
                if (this.settings.blockSending) {
                    this.showSendBlockModal(result, content, event);
                } else {
                    this.showInlineWarning(warningContainer, result);
                }
                
                return false;
            }
        } catch (error) {
            console.error('Error analyzing before send:', error);
        }
    }

    showSendBlockModal(result, content, originalEvent) {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'send-block-modal';
        modal.innerHTML = `
            <h3 style="color: #f44336; margin-top: 0;">⚠️ Potentially Harmful Content Detected</h3>
            <p>This email contains content that may be considered:</p>
            <ul>
                ${result.categories.map(cat => `<li>${cat.replace('_', ' ')}</li>`).join('')}
            </ul>
            <p><strong>Confidence:</strong> ${(result.confidence * 100).toFixed(1)}%</p>
            
            ${this.settings.showSuggestions ? `
                <div style="margin: 15px 0;">
                    <strong>Suggestions:</strong>
                    <ul>
                        ${result.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            <div class="modal-buttons">
                <button class="modal-button cancel" onclick="this.closest('.send-block-modal').parentNode.remove(); this.closest('.modal-overlay').remove();">
                    Cancel Send
                </button>
                <button class="modal-button send" onclick="this.sendAnyway()">
                    Send Anyway
                </button>
            </div>
        `;
        
        // Add send anyway functionality
        modal.querySelector('.send').addEventListener('click', () => {
            overlay.remove();
            // Temporarily disable interception and trigger send
            originalEvent.target.dataset.ethicalDetectorIntercepted = 'false';
            originalEvent.target.click();
            setTimeout(() => {
                originalEvent.target.dataset.ethicalDetectorIntercepted = 'true';
            }, 100);
        });
        
        document.body.appendChild(overlay);
        overlay.appendChild(modal);
    }

    async analyzeContent(content, warningContainer, type) {
        if (!this.isEnabled || !content || content.length < 5) {
            warningContainer.innerHTML = '';
            return;
        }

        try {
            const result = await this.callAPI(content);
            
            warningContainer.innerHTML = '';
            
            if (result.is_toxic && result.confidence > (this.settings.sensitivity - 0.1)) {
                this.showInlineWarning(warningContainer, result);
                this.updateStats('warning');
            }
            
            this.updateStats('analyzed');
            
        } catch (error) {
            console.error('Error analyzing content:', error);
            warningContainer.innerHTML = `
                <div class="ethical-warning">
                    <div class="warning-header">Analysis Error</div>
                    Unable to analyze content. Please check your connection.
                </div>
            `;
        }
    }

    showInlineWarning(container, result) {
        const severityClass = result.confidence > 0.8 ? 'high' : result.confidence > 0.6 ? 'medium' : '';
        
        const warningDiv = document.createElement('div');
        warningDiv.className = `ethical-warning ${severityClass}`;
        warningDiv.innerHTML = `
            <div class="warning-header">
                ${result.confidence > 0.8 ? '🚨' : '⚠️'} Potentially Harmful Content Detected
            </div>
            <div>
                <strong>Issues found:</strong> ${result.categories.join(', ').replace(/_/g, ' ')}
            </div>
            <div class="warning-details">
                Confidence: ${(result.confidence * 100).toFixed(1)}%
            </div>
        `;
        
        container.appendChild(warningDiv);
        
        if (this.settings.showSuggestions && result.suggestions.length > 0) {
            const suggestionsDiv = document.createElement('div');
            suggestionsDiv.className = 'ethical-suggestion';
            suggestionsDiv.innerHTML = `
                <strong>💡 Suggestions for improvement:</strong>
                <ul>
                    ${result.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
                </ul>
            `;
            container.appendChild(suggestionsDiv);
        }
    }

    monitorInbox() {
        if (!this.settings.checkIncoming) return;
        
        // Monitor for new emails in inbox
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Look for email content
                        const emailElements = node.querySelectorAll ? node.querySelectorAll('[data-message-id], .ii.gt') : [];
                        emailElements.forEach(element => {
                            if (!element.dataset.ethicalDetectorChecked) {
                                this.analyzeIncomingEmail(element);
                            }
                        });
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    async analyzeIncomingEmail(emailElement) {
        if (!this.isEnabled || !emailElement) return;
        
        emailElement.dataset.ethicalDetectorChecked = 'true';
        
        const content = emailElement.innerText || emailElement.textContent || '';
        if (content.length < 20) return;

        try {
            const result = await this.callAPI(content);
            
            if (result.is_toxic && result.confidence > 0.4) {
                this.flagIncomingEmail(emailElement, result);
            }
        } catch (error) {
            console.error('Error analyzing incoming email:', error);
        }
    }

    flagIncomingEmail(emailElement, result) {
        const warning = document.createElement('div');
        warning.className = 'ethical-warning';
        warning.innerHTML = `
            <div class="warning-header">
                🚨 Potentially Harmful Email Content
            </div>
            <div>
                This email may contain: ${result.categories.join(', ').replace(/_/g, ' ')}
            </div>
            <div class="warning-details">
                Confidence: ${(result.confidence * 100).toFixed(1)}%
            </div>
        `;
        
        emailElement.insertBefore(warning, emailElement.firstChild);
    }

    async callAPI(content) {
        const response = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: content,
                email_context: {
                    type: 'compose',
                    timestamp: new Date().toISOString()
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
        }

        return await response.json();
    }

    toggleDetector() {
        this.isEnabled = !this.isEnabled;
        this.settings.enabled = this.isEnabled;
        this.saveSettings();
        
        const toggle = document.getElementById('detector-toggle');
        toggle.textContent = this.isEnabled ? 'ON' : 'OFF';
        toggle.className = `detector-toggle ${this.isEnabled ? '' : 'disabled'}`;
        
        // Clear warnings when disabled
        if (!this.isEnabled) {
            const warnings = document.querySelectorAll('.ethical-warning, .ethical-suggestion');
            warnings.forEach(warning => warning.remove());
        }
        
        console.log(`Ethical detector ${this.isEnabled ? 'enabled' : 'disabled'}`);
    }

    updateStats(type) {
        const stats = document.getElementById('detector-stats');
        if (!stats) return;
        
        // Get current stats from storage or initialize
        chrome.storage.local.get(['detectorStats'], (result) => {
            const currentStats = result.detectorStats || { analyzed: 0, warnings: 0 };
            
            if (type === 'analyzed') {
                currentStats.analyzed++;
            } else if (type === 'warning') {
                currentStats.warnings++;
            }
            
            // Update display
            stats.innerHTML = `
                <span>Analyzed: ${currentStats.analyzed}</span>
                <span>Warnings: ${currentStats.warnings}</span>
            `;
            
            // Save to storage
            chrome.storage.local.set({ detectorStats: currentStats });
        });
    }
}

// Initialize the detector when page loads
if (window.location.hostname === 'mail.google.com') {
    // Small delay to ensure Gmail is ready
    setTimeout(() => {
        new GmailEthicalDetector();
    }, 2000);
}