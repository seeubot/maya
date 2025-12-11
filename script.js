// ==============================
// Maya TV - Main Application Script
// ==============================

// ============================== 
// Configuration & Constants
// ==============================
const CONFIG = {
    API_URL: "https://static-crane-seeutech-17dd4df3.koyeb.app/api/channels",
    AD_INTERVAL: 10 * 60 * 1000, // 10 minutes in milliseconds
    AD_DURATION: 5000, // 5 seconds (simulated ad duration)
    DEFAULT_HEADERS: {
        'Referer': 'https://www.jiotv.com/',
        'User-Agent': "plaYtv/7.1.5 (Linux;Android 13) ExoPlayerLib/2.11.6"
    },
    PLAYER_CONFIG: {
        streaming: {
            lowLatencyMode: true,
            bufferingGoal: 15,
            rebufferingGoal: 3,
            bufferBehind: 15,
            retryParameters: {
                timeout: 15000,
                maxAttempts: 5,
                baseDelay: 1000,
                backoffFactor: 2
            }
        },
        manifest: {
            retryParameters: {
                timeout: 10000,
                maxAttempts: 3
            }
        },
        abr: {
            enabled: false,
            defaultBandwidthEstimate: 5000000
        }
    }
};

// ==============================
// State Management
// ==============================
const AppState = {
    allChannels: [],
    currentChannel: null,
    currentSearchTerm: '',
    player: null,
    video: null,
    ui: null,
    adTimer: null,
    lastAdTime: null,
    isAdShowing: false,
    viewMode: 'list',
    isTvMode: false,
    debugMode: false,
    retryCount: 0,
    maxRetries: 3
};

// ==============================
// DOM Elements Cache
// ==============================
const DOM = {
    channelSearchInput: null,
    channelGrid: null,
    errorContainer: null,
    errorText: null,
    channelsSidebar: null,
    toggleSidebarBtn: null,
    currentChannelElement: null,
    streamStatusIndicator: null,
    splashScreen: null,
    startWatchingBtn: null,
    playerArea: null,
    videoContainer: null,
    adOverlay: null,
    adChannelName: null,
    adTimer: null,
    refreshBtn: null,
    viewToggleBtns: null,
    tvModeIndicator: null,
    debugOverlay: null,
    debugStatus: null,
    debugDimensions: null,
    debugReadyState: null,
    debugNetwork: null
};

// ==============================
// Initialization
// ==============================
function cacheDOMElements() {
    DOM.channelSearchInput = document.getElementById('channel-search');
    DOM.channelGrid = document.getElementById('channel-grid');
    DOM.errorContainer = document.getElementById('error-container');
    DOM.errorText = document.getElementById('error-text');
    DOM.channelsSidebar = document.getElementById('channels-sidebar');
    DOM.toggleSidebarBtn = document.getElementById('toggle-sidebar');
    DOM.currentChannelElement = document.getElementById('current-channel');
    DOM.streamStatusIndicator = document.getElementById('stream-status');
    DOM.splashScreen = document.getElementById('splash-screen');
    DOM.startWatchingBtn = document.getElementById('start-watching');
    DOM.playerArea = document.getElementById('player-area');
    DOM.videoContainer = document.querySelector('.shaka-video-container');
    DOM.adOverlay = document.getElementById('ad-overlay');
    DOM.adChannelName = document.getElementById('ad-channel-name');
    DOM.adTimer = document.getElementById('ad-timer');
    DOM.refreshBtn = document.getElementById('refresh-btn');
    DOM.viewToggleBtns = document.querySelectorAll('.view-btn');
    DOM.tvModeIndicator = document.getElementById('tv-mode');
    DOM.debugOverlay = document.getElementById('debug-overlay');
    DOM.debugStatus = document.getElementById('debug-status');
    DOM.debugDimensions = document.getElementById('debug-dimensions');
    DOM.debugReadyState = document.getElementById('debug-readystate');
    DOM.debugNetwork = document.getElementById('debug-network');
}

async function initPlayer() {
    // Install polyfills
    shaka.polyfill.installAll();
    
    // Check browser support
    if (!shaka.Player.isBrowserSupported()) {
        showError('Your browser is not supported for video playback. Please try Chrome, Firefox, or Edge.');
        return false;
    }
    
    // Get video element
    AppState.video = document.querySelector('video');
    if (!AppState.video) {
        showError('Video element not found');
        return false;
    }
    
    // Initialize player
    try {
        AppState.player = new shaka.Player(AppState.video);
        
        // Configure for TV streaming
        AppState.player.configure(CONFIG.PLAYER_CONFIG);
        
        // Initialize UI
        if (DOM.videoContainer) {
            AppState.ui = new shaka.ui.Overlay(AppState.player, DOM.videoContainer, AppState.video);
            
            // Configure UI controls
            const controls = AppState.ui.getControls();
            if (controls) {
                controls.configure({
                    controlPanelElements: [
                        'play_pause', 'time_and_duration', 'volume', 'fullscreen'
                    ],
                    addSeekBar: true,
                    showUnbufferedStart: true,
                    volumeBarColors: { base: '#3B82F6', level: '#3B82F6' },
                    seekBarColors: { base: '#FACC15', buffered: '#FACC15', played: '#FACC15' }
                });
            }
        }
        
        // Setup event listeners
        setupPlayerEvents();
        
        // Default settings
        AppState.video.volume = 1.0;
        AppState.video.muted = false;
        
        console.log('Player initialized successfully');
        return true;
        
    } catch (error) {
        console.error('Player initialization error:', error);
        showError('Failed to initialize video player: ' + error.message);
        return false;
    }
}

function setupPlayerEvents() {
    if (!AppState.player || !AppState.video) return;
    
    // Player error handling
    AppState.player.addEventListener('error', (event) => {
        console.error('Shaka Player Error:', event.detail);
        updateStreamStatus('offline');
        
        if (AppState.currentChannel && AppState.retryCount < AppState.maxRetries) {
            AppState.retryCount++;
            console.log(`Retrying stream (${AppState.retryCount}/${AppState.maxRetries})...`);
            
            setTimeout(() => {
                playChannel(AppState.currentChannel);
            }, 3000);
        } else {
            AppState.retryCount = 0;
        }
        
        updateDebugInfo();
    });
    
    // Player events for status updates
    AppState.player.addEventListener('loading', () => {
        updateStreamStatus('connecting');
        updateDebugInfo();
    });
    
    AppState.player.addEventListener('loaded', () => {
        updateStreamStatus('live');
        AppState.retryCount = 0;
        updateDebugInfo();
    });
    
    AppState.player.addEventListener('buffering', (event) => {
        if (event.buffering) {
            updateStreamStatus('buffering');
        } else {
            updateStreamStatus('live');
        }
        updateDebugInfo();
    });
    
    // Video element events
    AppState.video.addEventListener('loadedmetadata', () => {
        console.log('Video metadata loaded');
        updateStreamStatus('live');
        
        // Force video dimensions
        AppState.video.style.width = '100%';
        AppState.video.style.height = '100%';
        AppState.video.style.display = 'block';
        
        // Try to play
        attemptAutoplay();
        
        updateDebugInfo();
    });
    
    AppState.video.addEventListener('canplay', () => {
        console.log('Video can play');
        updateStreamStatus('live');
        updateDebugInfo();
    });
    
    AppState.video.addEventListener('playing', () => {
        console.log('Video is playing');
        updateStreamStatus('live');
        
        // Update TV mode status
        if (window.innerWidth >= 1200) {
            AppState.isTvMode = true;
            DOM.tvModeIndicator.classList.add('active');
        }
        
        updateDebugInfo();
    });
    
    AppState.video.addEventListener('pause', () => {
        updateStreamStatus('paused');
        updateDebugInfo();
    });
    
    AppState.video.addEventListener('ended', () => {
        updateStreamStatus('ended');
        updateDebugInfo();
    });
    
    // Periodic debug updates
    setInterval(updateDebugInfo, 1000);
}

async function initApp() {
    cacheDOMElements();
    
    // Check if we're on a TV-like device
    AppState.isTvMode = window.innerWidth >= 1200;
    if (AppState.isTvMode) {
        console.log('TV Mode detected');
        DOM.tvModeIndicator.classList.add('active');
    }
    
    // Initialize player
    const playerReady = await initPlayer();
    if (!playerReady) {
        showError('Failed to initialize video player');
        return;
    }
    
    // Load channels
    await loadChannels();
    
    // Setup event listeners
    setupEventListeners();
    
    // Set initial sidebar state
    if (window.innerWidth <= 768) {
        DOM.channelsSidebar.classList.remove('open');
    } else {
        DOM.channelsSidebar.classList.add('open');
    }
    
    // Enable debug mode with Shift+D
    document.addEventListener('keydown', (e) => {
        if (e.shiftKey && e.key === 'D') {
            AppState.debugMode = !AppState.debugMode;
            DOM.debugOverlay.classList.toggle('active', AppState.debugMode);
            console.log(`Debug mode ${AppState.debugMode ? 'enabled' : 'disabled'}`);
        }
    });
    
    console.log('App initialized successfully');
}

// ==============================
// Event Listeners Setup
// ==============================
function setupEventListeners() {
    // Search
    DOM.channelSearchInput.addEventListener('input', (e) => {
        AppState.currentSearchTerm = e.target.value.toLowerCase();
        renderChannels();
    });
    
    // Sidebar toggle
    DOM.toggleSidebarBtn.addEventListener('click', toggleSidebar);
    
    // Splash screen
    DOM.startWatchingBtn.addEventListener('click', () => {
        DOM.splashScreen.style.display = 'none';
        DOM.channelsSidebar.classList.add('open');
        const firstCard = DOM.channelGrid.querySelector('.channel-card');
        if (firstCard) firstCard.focus();
    });
    
    // Error refresh
    DOM.refreshBtn.addEventListener('click', loadChannels);
    
    // View mode toggle (only list view)
    DOM.viewToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Force list view only
            DOM.viewToggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            DOM.channelGrid.classList.remove('grid-view', 'list-view');
            DOM.channelGrid.classList.add('list-view');
        });
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboardNavigation);
    
    // Fullscreen changes
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            try {
                screen.orientation.lock('landscape').catch(() => {});
            } catch (e) {}
        } else {
            try {
                screen.orientation.unlock();
            } catch (e) {}
        }
    });
    
    // Window resize
    window.addEventListener('resize', () => {
        // Update TV mode
        AppState.isTvMode = window.innerWidth >= 1200;
        DOM.tvModeIndicator.classList.toggle('active', AppState.isTvMode);
        
        // Auto-close sidebar on mobile when playing
        if (window.innerWidth <= 768 && AppState.currentChannel) {
            DOM.channelsSidebar.classList.remove('open');
        }
    });
}

// ==============================
// API Functions
// ==============================
async function loadChannels() {
    hideError();
    showLoading();
    
    try {
        const response = await fetch(CONFIG.API_URL, {
            headers: CONFIG.DEFAULT_HEADERS
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && Array.isArray(data.data)) {
            AppState.allChannels = data.data;
            renderChannels();
            console.log(`Loaded ${data.data.length} channels`);
        } else {
            throw new Error('Invalid API response format');
        }
        
    } catch (error) {
        console.error('Failed to load channels:', error);
        showError(`Failed to load channels: ${error.message}`);
    }
}

// ==============================
// UI Rendering
// ==============================
function showLoading() {
    DOM.channelGrid.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <p>Loading channels...</p>
        </div>
    `;
}

function showError(message) {
    DOM.errorText.textContent = message;
    DOM.errorContainer.classList.add('active');
}

function hideError() {
    DOM.errorContainer.classList.remove('active');
}

function updateStreamStatus(status) {
    DOM.streamStatusIndicator.textContent = status.toUpperCase();
    DOM.streamStatusIndicator.classList.remove('status-live', 'status-offline', 'status-connecting', 'status-buffering', 'status-paused', 'status-ended');
    DOM.streamStatusIndicator.classList.add(`status-${status.toLowerCase()}`);
}

function renderChannels() {
    const filteredChannels = AppState.currentSearchTerm.length > 0
        ? AppState.allChannels.filter(channel => 
            channel.title.toLowerCase().includes(AppState.currentSearchTerm))
        : AppState.allChannels;
    
    if (filteredChannels.length === 0) {
        DOM.channelGrid.innerHTML = `
            <div class="loading">
                <p>No channels found matching "${AppState.currentSearchTerm}"</p>
            </div>
        `;
        return;
    }
    
    DOM.channelGrid.innerHTML = '';
    
    filteredChannels.forEach(channel => {
        const card = createChannelCard(channel);
        DOM.channelGrid.appendChild(card);
    });
    
    // Focus management
    const activeCard = DOM.channelGrid.querySelector('.channel-card.active');
    if (activeCard) {
        activeCard.focus();
    }
}

function createChannelCard(channel) {
    const card = document.createElement('div');
    card.className = 'channel-card';
    card.tabIndex = 0;

    const isActive = AppState.currentChannel && AppState.currentChannel.id === channel.id;
    if (isActive) {
        card.classList.add('active');
    }
    
    const placeholderUrl = `https://placehold.co/120x60/334155/F8FAFC?text=${encodeURIComponent(channel.title.substring(0, 10))}`;
    
    card.innerHTML = `
        <img src="${channel.logo || placeholderUrl}" 
             alt="${channel.title}" 
             class="channel-logo"
             onerror="this.src='${placeholderUrl}'">
        <div class="channel-info">
            <div class="channel-title">${channel.title}</div>
        </div>
    `;
    
    const playHandler = (e) => {
        e.preventDefault();
        playChannel(channel);
    };
    
    card.addEventListener('click', playHandler);
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            playHandler(e);
        }
    });
    
    return card;
}

function toggleSidebar() {
    DOM.channelsSidebar.classList.toggle('open');
    if (DOM.channelsSidebar.classList.contains('open')) {
        const activeCard = DOM.channelGrid.querySelector('.channel-card.active');
        if (activeCard) {
            activeCard.focus();
        } else {
            DOM.channelSearchInput.focus();
        }
    }
}

// ==============================
// Debug Functions
// ==============================
function updateDebugInfo() {
    if (!AppState.debugMode || !AppState.video) return;
    
    DOM.debugStatus.textContent = DOM.streamStatusIndicator.textContent;
    DOM.debugDimensions.textContent = `${AppState.video.videoWidth}x${AppState.video.videoHeight}`;
    DOM.debugReadyState.textContent = AppState.video.readyState;
    DOM.debugNetwork.textContent = AppState.video.networkState;
}

function debugVideoPlayback() {
    if (!AppState.video) {
        console.error('Video element not found');
        return;
    }
    
    console.log('=== Video Debug Info ===');
    console.log('Video element:', AppState.video);
    console.log('Video src:', AppState.video.src);
    console.log('Video readyState:', AppState.video.readyState);
    console.log('Video error:', AppState.video.error);
    console.log('Video dimensions:', AppState.video.videoWidth, 'x', AppState.video.videoHeight);
    console.log('Is playing:', !AppState.video.paused);
    console.log('Is muted:', AppState.video.muted);
    console.log('Volume:', AppState.video.volume);
    console.log('Current time:', AppState.video.currentTime);
    console.log('Duration:', AppState.video.duration);
    
    // Check media tracks
    const videoTracks = AppState.video.getVideoTracks ? AppState.video.getVideoTracks() : [];
    const audioTracks = AppState.video.getAudioTracks ? AppState.video.getAudioTracks() : [];
    
    console.log('Video tracks:', videoTracks.length);
    console.log('Audio tracks:', audioTracks.length);
    
    if (AppState.player) {
        console.log('Player state:', AppState.player.getStats());
        console.log('Player configuration:', AppState.player.getConfiguration());
    }
}

// ==============================
// Ad System
// ==============================
function showAdDialog(channelName) {
    if (AppState.isAdShowing) return;
    
    AppState.isAdShowing = true;
    DOM.adChannelName.textContent = channelName;
    DOM.adOverlay.classList.add('active');
    
    let countdown = Math.ceil(CONFIG.AD_DURATION / 1000);
    DOM.adTimer.textContent = `${countdown}s`;
    
    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            DOM.adTimer.textContent = `${countdown}s`;
        } else {
            clearInterval(countdownInterval);
            hideAdDialog();
        }
    }, 1000);
}

function hideAdDialog() {
    DOM.adOverlay.classList.remove('active');
    AppState.isAdShowing = false;
    AppState.lastAdTime = Date.now();
}

function scheduleNextAd() {
    if (AppState.adTimer) {
        clearTimeout(AppState.adTimer);
    }
    
    AppState.adTimer = setTimeout(() => {
        if (AppState.currentChannel && AppState.video && !AppState.video.paused) {
            showAdDialog(AppState.currentChannel.title);
        }
        scheduleNextAd();
    }, CONFIG.AD_INTERVAL);
}

// ==============================
// Playback Functions
// ==============================
async function playChannel(channel) {
    if (!AppState.player || !AppState.video) return;
    
    console.log(`Playing channel: ${channel.title}`);
    
    // Pause current playback
    AppState.video.pause();
    
    // Update UI
    document.querySelectorAll('.channel-card').forEach(card => {
        card.classList.remove('active');
    });
    
    AppState.currentChannel = channel;
    DOM.currentChannelElement.textContent = channel.title;
    updateStreamStatus('connecting');
    
    // Highlight selected channel
    const currentCard = Array.from(document.querySelectorAll('.channel-card')).find(card => 
        card.querySelector('.channel-title').textContent === channel.title
    );
    if (currentCard) {
        currentCard.classList.add('active');
        currentCard.focus();
    }
    
    // Ensure player is visible
    DOM.splashScreen.style.display = 'none';
    DOM.videoContainer.style.display = 'block';
    DOM.videoContainer.style.visibility = 'visible';
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        DOM.channelsSidebar.classList.remove('open');
    }
    
    // Show initial ad (simplified for TV)
    if (!AppState.isAdShowing) {
        showAdDialog(channel.title);
        
        // Load stream after ad
        setTimeout(async () => {
            await loadChannelStream(channel);
        }, CONFIG.AD_DURATION);
    } else {
        // If ad already showing, load stream directly
        await loadChannelStream(channel);
    }
}

async function loadChannelStream(channel) {
    try {
        console.log('Loading stream for channel:', channel.title);
        
        // Unload previous content
        await AppState.player.unload();
        
        // Configure DRM if available
        if (channel.key && channel.key.includes(':')) {
            const [keyId, keyValue] = channel.key.split(':');
            AppState.player.configure({
                drm: {
                    clearKeys: {
                        [keyId]: keyValue
                    }
                }
            });
        }
        
        // Configure request headers for TV streams
        AppState.player.getNetworkingEngine().registerRequestFilter((type, request) => {
            request.headers['Referer'] = CONFIG.DEFAULT_HEADERS.Referer;
            request.headers['User-Agent'] = CONFIG.DEFAULT_HEADERS['User-Agent'];
            request.headers['Origin'] = 'https://www.jiotv.com';
            
            if (channel.cookie) {
                request.headers['Cookie'] = channel.cookie;
            }
            
            // Add hdnea parameter if available
            if (channel.cookie && 
                (type === shaka.net.NetworkingEngine.RequestType.MANIFEST ||
                 type === shaka.net.NetworkingEngine.RequestType.SEGMENT)) {
                const hdneaMatch = channel.cookie.match(/__hdnea__=[^;]+/);
                if (hdneaMatch && !request.uris[0].includes('__hdnea__=')) {
                    const separator = request.uris[0].includes('?') ? '&' : '?';
                    request.uris[0] += separator + hdneaMatch[0];
                }
            }
        });
        
        // Load the stream with retry parameters
        await AppState.player.load(channel.url, null, {
            retryParameters: {
                maxAttempts: 3,
                baseDelay: 1000,
                backoffFactor: 2
            }
        });
        
        // Force video to play
        await attemptAutoplay();
        
        // Schedule recurring ads
        scheduleNextAd();
        
        // Request fullscreen on TV mode
        if (AppState.isTvMode && !document.fullscreenElement) {
            setTimeout(() => {
                requestFullscreen();
            }, 1000);
        }
        
        console.log('Stream loaded successfully');
        
    } catch (error) {
        console.error('Stream loading error:', error);
        updateStreamStatus('offline');
        
        // Auto-retry
        if (AppState.retryCount < AppState.maxRetries) {
            AppState.retryCount++;
            console.log(`Retrying stream (${AppState.retryCount}/${AppState.maxRetries})...`);
            
            setTimeout(() => {
                loadChannelStream(channel);
            }, 3000);
        } else {
            AppState.retryCount = 0;
            showError(`Failed to load stream: ${error.message}`);
        }
    }
}

async function attemptAutoplay() {
    if (!AppState.video) return false;
    
    try {
        // First try with sound
        AppState.video.muted = false;
        await AppState.video.play();
        console.log('Autoplay with sound successful');
        return true;
    } catch (error) {
        console.log('Autoplay with sound failed, trying muted:', error.message);
        
        try {
            // Try muted
            AppState.video.muted = true;
            await AppState.video.play();
            console.log('Autoplay muted successful');
            return true;
        } catch (mutedError) {
            console.log('Autoplay completely failed:', mutedError.message);
            
            // Show play button overlay if needed
            if (AppState.currentChannel) {
                updateStreamStatus('ready');
            }
            
            return false;
        }
    }
}

function requestFullscreen() {
    const playerArea = DOM.playerArea;
    try {
        if (playerArea.requestFullscreen) {
            playerArea.requestFullscreen();
        } else if (playerArea.webkitRequestFullscreen) {
            playerArea.webkitRequestFullscreen();
        } else if (playerArea.mozRequestFullScreen) {
            playerArea.mozRequestFullScreen();
        } else if (playerArea.msRequestFullscreen) {
            playerArea.msRequestFullscreen();
        } else if (AppState.video.webkitEnterFullscreen) {
            AppState.video.webkitEnterFullscreen();
        }
        
        if (AppState.isTvMode) {
            try {
                screen.orientation.lock('landscape').catch(() => {});
            } catch (e) {}
        }
    } catch (e) {
        console.warn("Fullscreen request failed:", e);
    }
}

// ==============================
// Channel Navigation
// ==============================
function changeChannelByDelta(delta) {
    if (AppState.allChannels.length === 0) return;
    
    let currentId = AppState.currentChannel ? AppState.currentChannel.id : null;
    let currentIndex = currentId ? AppState.allChannels.findIndex(c => c.id === currentId) : -1;

    if (currentIndex === -1) {
        currentIndex = delta > 0 ? -1 : 0;
    }
    
    let nextIndex = currentIndex + delta;
    
    if (nextIndex >= AppState.allChannels.length) {
        nextIndex = 0;
    } else if (nextIndex < 0) {
        nextIndex = AppState.allChannels.length - 1;
    }
    
    playChannel(AppState.allChannels[nextIndex]);
}

// ==============================
// Keyboard Navigation
// ==============================
function handleKeyboardNavigation(e) {
    if (document.activeElement === DOM.channelSearchInput) {
        return;
    }
    
    const isSidebarOpen = DOM.channelsSidebar.classList.contains('open');
    const focusableChannels = Array.from(DOM.channelGrid.querySelectorAll('.channel-card'));
    let currentFocusIndex = focusableChannels.findIndex(el => el === document.activeElement);

    switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown':
            if (isSidebarOpen && focusableChannels.length > 0) {
                e.preventDefault();
                const delta = e.key === 'ArrowDown' ? 1 : -1;
                let nextIndex = currentFocusIndex + delta;
                
                if (nextIndex >= focusableChannels.length) {
                    nextIndex = 0;
                } else if (nextIndex < 0) {
                    nextIndex = focusableChannels.length - 1;
                }
                
                focusableChannels[nextIndex].focus();
                focusableChannels[nextIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
            break;

        case 'Enter':
            if (!isSidebarOpen && AppState.player && AppState.video) {
                e.preventDefault();
                if (AppState.video.paused) {
                    AppState.video.play();
                    updateStreamStatus('live');
                } else {
                    AppState.video.pause();
                    updateStreamStatus('paused');
                }
            }
            break;
        
        case 'Escape':
            e.preventDefault();
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else if (isSidebarOpen) {
                DOM.channelsSidebar.classList.remove('open');
                DOM.toggleSidebarBtn.focus();
            } else {
                DOM.channelsSidebar.classList.add('open');
                const activeCard = DOM.channelGrid.querySelector('.channel-card.active');
                if (activeCard) activeCard.focus();
            }
            break;
        
        case 'PageUp':
        case 'ChannelUp':
            e.preventDefault();
            changeChannelByDelta(-1);
            break;
        
        case 'PageDown':
        case 'ChannelDown':
            e.preventDefault();
            changeChannelByDelta(1);
            break;
            
        case ' ':
            if (AppState.video && document.activeElement.tagName !== 'INPUT') {
                e.preventDefault();
                if (AppState.video.paused) {
                    AppState.video.play();
                } else {
                    AppState.video.pause();
                }
            }
            break;
            
        case 'm':
        case 'M':
            if (AppState.video) {
                e.preventDefault();
                AppState.video.muted = !AppState.video.muted;
            }
            break;
            
        case 'f':
        case 'F':
            e.preventDefault();
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                requestFullscreen();
            }
            break;
    }
}

// ==============================
// Start Application
// ==============================
window.addEventListener('DOMContentLoaded', initApp);

// Expose debug function globally for testing
window.debugVideoPlayback = debugVideoPlayback;
