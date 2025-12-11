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
            bufferingGoal: 10,
            rebufferingGoal: 2,
            bufferBehind: 10,
            retryParameters: {
                timeout: 10000,
                maxAttempts: 3,
                baseDelay: 1000,
                backoffFactor: 2
            }
        },
        manifest: {
            retryParameters: {
                timeout: 8000,
                maxAttempts: 2
            }
        },
        abr: {
            enabled: true
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
    viewMode: 'list' // 'list' or 'grid'
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
    viewToggleBtns: null
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
}

async function initPlayer() {
    shaka.polyfill.installAll();
    
    if (!shaka.Player.isBrowserSupported()) {
        showError('Your browser is not supported for video playback.');
        return false;
    }
    
    AppState.video = document.querySelector('video');
    AppState.player = new shaka.Player();
    await AppState.player.attach(AppState.video);
    
    const container = DOM.videoContainer;
    AppState.ui = new shaka.ui.Overlay(AppState.player, container, AppState.video);
    
    AppState.ui.configure({
        controlPanelElements: [
            'play_pause', 'time_and_duration', 'mute', 'volume',
            'spacer', 'audio', 'quality', 'fullscreen'
        ],
        volumeBarColors: { base: '#3B82F6', level: '#3B82F6' },
        seekBarColors: { base: '#FACC15', buffered: '#FACC15', played: '#FACC15' }
    });
    
    AppState.player.configure(CONFIG.PLAYER_CONFIG);
    
    // Event listeners
    AppState.player.addEventListener('error', (event) => {
        console.error('Player error:', event.detail);
        updateStreamStatus('offline');
    });

    AppState.video.addEventListener('loadeddata', () => {
        updateStreamStatus('live');
    });
    
    AppState.video.volume = 0.8;
    
    return true;
}

async function initApp() {
    cacheDOMElements();
    
    const playerReady = await initPlayer();
    if (!playerReady) return;

    await loadChannels();
    setupEventListeners();
    
    // Set initial sidebar state based on screen size
    if (window.innerWidth <= 768) {
        DOM.channelsSidebar.classList.remove('open');
    } else {
        DOM.channelsSidebar.classList.add('open');
    }
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
    
    // View mode toggle
    DOM.viewToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            AppState.viewMode = view;
            
            DOM.viewToggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            DOM.channelGrid.classList.remove('grid-view', 'list-view');
            DOM.channelGrid.classList.add(`${view}-view`);
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
}

// ==============================
// API Functions
// ==============================
async function loadChannels() {
    hideError();
    showLoading();
    
    try {
        const response = await fetch(CONFIG.API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && Array.isArray(data.data)) {
            AppState.allChannels = data.data;
            renderChannels();
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
    DOM.streamStatusIndicator.classList.remove('status-live', 'status-offline');
    DOM.streamStatusIndicator.classList.add(`status-${status}`);
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
// Ad System (Web-based simulation)
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
    if (!AppState.player) return;
    
    // Update UI
    document.querySelectorAll('.channel-card').forEach(card => {
        card.classList.remove('active');
    });
    
    AppState.currentChannel = channel;
    DOM.currentChannelElement.textContent = channel.title;
    updateStreamStatus('offline');
    
    // Highlight selected channel
    const currentCard = Array.from(document.querySelectorAll('.channel-card')).find(card => 
        card.querySelector('.channel-title').textContent === channel.title
    );
    if (currentCard) {
        currentCard.classList.add('active');
        currentCard.focus();
    }
    
    // Hide splash, show player
    DOM.splashScreen.style.display = 'none';
    DOM.videoContainer.classList.add('active');
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        DOM.channelsSidebar.classList.remove('open');
    }
    
    // Show initial ad before stream starts
    showAdDialog(channel.title);
    
    // Wait for ad to finish, then load stream
    setTimeout(async () => {
        try {
            await AppState.player.unload();
            AppState.player.configure(CONFIG.PLAYER_CONFIG);
            
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
            
            // Configure request filters
            AppState.player.getNetworkingEngine().clearAllRequestFilters();
            AppState.player.getNetworkingEngine().registerRequestFilter((type, request) => {
                request.headers['Referer'] = CONFIG.DEFAULT_HEADERS.Referer;
                request.headers['User-Agent'] = CONFIG.DEFAULT_HEADERS['User-Agent'];
                
                if (channel.cookie) {
                    request.headers['Cookie'] = channel.cookie;
                }
                
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
            
            await AppState.player.load(channel.url);
            await attemptAutoplay();
            
            // Schedule recurring ads
            scheduleNextAd();
            
            // Request fullscreen
            requestFullscreen();
            
        } catch (error) {
            console.error('Playback error:', error);
            updateStreamStatus('offline');
        }
    }, CONFIG.AD_DURATION);
}

async function attemptAutoplay() {
    if (!AppState.video) return false;
    
    try {
        AppState.video.muted = false;
        await AppState.video.play();
        return true;
    } catch (error) {
        try {
            AppState.video.muted = true;
            await AppState.video.play();
            return true;
        } catch (mutedError) {
            console.log('Autoplay failed:', mutedError.message);
            return false;
        }
    }
}

function requestFullscreen() {
    const playerArea = DOM.playerArea;
    try {
        if (playerArea.requestFullscreen) {
            playerArea.requestFullscreen();
        } else if (AppState.video.webkitEnterFullscreen) {
            AppState.video.webkitEnterFullscreen();
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
                } else {
                    AppState.video.pause();
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
    }
}

// ==============================
// Start Application
// ==============================
window.addEventListener('DOMContentLoaded', initApp);
