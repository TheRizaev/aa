class VoiceInterface {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.silenceTimer = null;
        this.audioContext = null;
        this.analyser = null;
        this.isProcessing = false;
        
        // UI Elements
        this.voiceButton = null;
        this.voiceOverlay = null;
        this.waveContainer = null;
        
        // Settings
        this.silenceThreshold = 30; // Silence threshold in dB
        this.silenceDelay = 4000; // 2.5 seconds of silence
        
        this.init();
    }
    
    init() {
        // Create voice button
        this.createVoiceButton();
        
        // Create voice overlay
        this.createVoiceOverlay();
        
        // Initialize audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Bind events
        this.bindEvents();
    }
    
    createVoiceButton() {
        const chatInput = document.getElementById('ai-chat-input');
        if (!chatInput) return;
        
        const inputWrapper = chatInput.parentElement;
        
        // Create voice button
        this.voiceButton = document.createElement('button');
        this.voiceButton.id = 'voice-chat-button';
        this.voiceButton.className = 'voice-chat-button';
        this.voiceButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="voice-icon">
                <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" fill="currentColor"/>
                <path d="M17 12C17 14.76 14.76 17 12 17C9.24 17 7 14.76 7 12H5C5 15.53 7.61 18.47 11 18.93V23H13V18.93C16.39 18.47 19 15.53 19 12H17Z" fill="currentColor"/>
            </svg>
        `;
        this.voiceButton.title = 'Голосовой ввод (удерживайте для записи)';
        
        // Insert before send button
        const sendButton = inputWrapper.querySelector('.ai-chat-send');
        inputWrapper.insertBefore(this.voiceButton, sendButton);
    }
    
    createVoiceOverlay() {
        // Create overlay container
        this.voiceOverlay = document.createElement('div');
        this.voiceOverlay.id = 'voice-overlay';
        this.voiceOverlay.className = 'voice-overlay';
        
        this.voiceOverlay.innerHTML = `
            <div class="voice-overlay-content">
                <div class="voice-logo-container">
                    <div class="kronik-logo-large">K</div>
                    <div class="kronik-subtitle">KRONIK AI</div>
                </div>
                
                <div class="voice-visualizer-container">
                    <div class="voice-wave-container" id="voice-wave-container">
                        <canvas id="voice-wave-canvas"></canvas>
                        <div class="voice-circle-visualizer">
                            <div class="circle-ring ring-1"></div>
                            <div class="circle-ring ring-2"></div>
                            <div class="circle-ring ring-3"></div>
                            <div class="circle-center">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" fill="currentColor"/>
                                    <path d="M17 12C17 14.76 14.76 17 12 17C9.24 17 7 14.76 7 12H5C5 15.53 7.61 18.47 11 18.93V23H13V18.93C16.39 18.47 19 15.53 19 12H17Z" fill="currentColor"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="voice-status">
                    <div class="voice-status-icon">
                        <div class="voice-recording-dot"></div>
                    </div>
                    <div class="voice-status-text">Kronik слушает...</div>
                </div>
                
                
                <button class="voice-cancel-button">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(this.voiceOverlay);
        
        // Get wave container
        this.waveContainer = document.getElementById('voice-wave-container');
        this.waveCanvas = document.getElementById('voice-wave-canvas');
        this.waveContext = this.waveCanvas.getContext('2d');
        
        // Set canvas size
        this.resizeCanvas();
        
        // Add styles
        this.addStyles();
    }
    
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .voice-chat-button {
                position: relative;
                overflow: hidden;
            }
            
            @keyframes pulse {
                0% {
                    transform: translate(-50%, -50%) scale(0);
                    opacity: 1;
                }
                100% {
                    transform: translate(-50%, -50%) scale(2);
                    opacity: 0;
                }
            }
            
            .voice-overlay {
                background: rgba(0, 0, 0, 0.95);
                backdrop-filter: blur(20px);
            }
            
            .voice-logo-container {
                position: absolute;
                top: 40px;
                left: 50%;
                transform: translateX(-50%);
                text-align: center;
                opacity: 0;
                animation: fadeInDown 0.6s ease-out forwards;
            }
            
            .kronik-logo-large {
                font-size: 48px;
                font-weight: 800;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                text-fill-color: transparent;
                margin-bottom: 8px;
                text-shadow: 0 0 30px rgba(102, 126, 234, 0.5);
            }
            
            .kronik-subtitle {
                font-size: 20px;
                font-weight: 500;
                color: #9ca3af;
                letter-spacing: 5px;
            }
            
            .voice-visualizer-container {
                position: relative;
                width: 100%;
                height: 200px;
                margin: 120px 0 40px;
            }
            
            .voice-circle-visualizer {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 150px;
                height: 150px;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .voice-circle-visualizer.active {
                opacity: 1;
            }
            
            .circle-ring {
                position: absolute;
                top: 50%;
                left: 50%;
                border-radius: 50%;
                border: 2px solid;
                opacity: 0.3;
            }
            
            .circle-ring.ring-1 {
                width: 100%;
                height: 100%;
                border-color: #667eea;
                transform: translate(-50%, -50%);
                animation: ringPulse 2s infinite;
            }
            
            .circle-ring.ring-2 {
                width: 120%;
                height: 120%;
                border-color: #764ba2;
                transform: translate(-50%, -50%);
                animation: ringPulse 2s infinite 0.5s;
            }
            
            .circle-ring.ring-3 {
                width: 140%;
                height: 140%;
                border-color: #667eea;
                transform: translate(-50%, -50%);
                animation: ringPulse 2s infinite 1s;
            }
            
            @keyframes ringPulse {
                0% {
                    transform: translate(-50%, -50%) scale(1);
                    opacity: 0.3;
                }
                50% {
                    transform: translate(-50%, -50%) scale(1.1);
                    opacity: 0.6;
                }
                100% {
                    transform: translate(-50%, -50%) scale(1);
                    opacity: 0.3;
                }
            }
            
            .circle-center {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 0 40px rgba(102, 126, 234, 0.6);
            }
            
            .circle-center svg {
                color: white;
                filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.5));
            }
            
            .voice-wave-container {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .voice-wave-container.active {
                opacity: 1;
            }
            
            .voice-wave-container.active ~ .voice-circle-visualizer {
                opacity: 0;
            }
            
            .voice-status {
                margin-bottom: 200px;
                opacity: 0;
                animation: fadeIn 0.6s ease-out 0.3s forwards;
            }
            
            .voice-status-text {
                font-size: 30px;
                font-weight: 500;
                background: linear-gradient(135deg,rgb(55, 50, 141) 0%,rgb(56, 127, 174) 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                text-fill-color: transparent;
            }
            
            .voice-recording-dot {
                width: 30px;
                height: 30px;
                background: #ef4444;
                border-radius: 50%;
                margin-right: 12px;
                box-shadow: 0 0 20px rgba(239, 68, 68, 0.8);
                transition: all 0.3s ease;
            }
            
            .voice-recording-dot.recording {
                animation: recordPulse 1s infinite;
            }
            
            .voice-recording-dot.processing {
                background: linear-gradient(135deg,rgb(49, 68, 152) 0%,rgb(60, 134, 171) 100%);
                box-shadow: 0 0 20px rgba(55, 72, 151, 0.8);
                animation: processingRotate 1s linear infinite;
            }
            
            @keyframes recordPulse {
                0%, 100% {
                    transform: scale(1);
                    opacity: 1;
                }
                50% {
                    transform: scale(1.2);
                    opacity: 0.8;
                }
            }
            
            @keyframes processingRotate {
                0% {
                    transform: rotate(0deg);
                }
                100% {
                    transform: rotate(360deg);
                }
            }
            
            .processing-bar {
                width: 100%;
                height: 4px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                overflow: hidden;
                position: relative;
            }
            
            .processing-bar::after {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, #667eea, #764ba2, transparent);
                animation: processingSlide 1.5s infinite;
            }
            
            @keyframes processingSlide {
                0% {
                    left: -100%;
                }
                100% {
                    left: 100%;
                }
            }
            
            .processing-particles {
                position: absolute;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 10px;
            }
            
            .processing-particles span {
                width: 8px;
                height: 8px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                animation: particleBounce 1.4s infinite ease-in-out both;
            }
            
            .processing-particles span:nth-child(1) { animation-delay: -0.32s; }
            .processing-particles span:nth-child(2) { animation-delay: -0.16s; }
            .processing-particles span:nth-child(3) { animation-delay: 0s; }
            .processing-particles span:nth-child(4) { animation-delay: 0.16s; }
            .processing-particles span:nth-child(5) { animation-delay: 0.32s; }
            
            @keyframes particleBounce {
                0%, 80%, 100% {
                    transform: scale(0);
                    opacity: 0.5;
                }
                40% {
                    transform: scale(1);
                    opacity: 1;
                }
            }
            
            @keyframes fadeIn {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @keyframes fadeInDown {
                from {
                    opacity: 0;
                    transform: translate(-50%, -20px);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, 0);
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    bindEvents() {
        // Voice button events
        if (this.voiceButton) {
            // Click for toggle recording
            this.voiceButton.addEventListener('click', () => {
                if (this.isRecording) {
                    this.stopRecording();
                } else {
                    this.startRecording();
                }
            });
            
            // Long press for continuous recording
            let pressTimer;
            this.voiceButton.addEventListener('mousedown', () => {
                pressTimer = setTimeout(() => {
                    if (!this.isRecording) {
                        this.startRecording(true); // Continuous mode
                    }
                }, 500);
            });
            
            this.voiceButton.addEventListener('mouseup', () => {
                clearTimeout(pressTimer);
            });
            
            this.voiceButton.addEventListener('mouseleave', () => {
                clearTimeout(pressTimer);
            });
        }
        
        // Cancel button
        const cancelButton = this.voiceOverlay.querySelector('.voice-cancel-button');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                this.cancelRecording();
            });
        }
        
        // Window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isRecording) {
                this.cancelRecording();
            }
        });
    }
    
    async startRecording(continuous = false) {
        if (this.isProcessing) return;
        
        try {
            // Request microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                } 
            });
            
            this.isRecording = true;
            this.audioChunks = [];
            
            // Show overlay
            this.showOverlay();
            
            // Setup audio analyser
            this.setupAnalyser(stream);
            
            // Create media recorder
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm'
            });
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.processRecording();
            };
            
            // Start recording
            this.mediaRecorder.start();
            
            // Start visualizer
            this.startVisualizer();
            
            // Start silence detection
            this.startSilenceDetection();
            
            // Update UI
            this.updateStatus('recording');
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.showError('Не удалось получить доступ к микрофону');
        }
    }
    
    stopRecording() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        
        // Stop media recorder
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        // Stop all tracks
        if (this.mediaRecorder && this.mediaRecorder.stream) {
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        // Clear timers
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        
        // Update UI
        this.updateStatus('processing');
    }
    
    cancelRecording() {
        this.isRecording = false;
        this.isProcessing = false;
        
        // Stop recording
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        // Stop all tracks
        if (this.mediaRecorder && this.mediaRecorder.stream) {
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        // Clear timers
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
        }
        
        // Hide overlay
        this.hideOverlay();
        
        // Clear chunks
        this.audioChunks = [];
    }
    
    async processRecording() {
        if (this.audioChunks.length === 0) {
            this.hideOverlay();
            return;
        }
        
        this.isProcessing = true;
        this.updateStatus('processing');
        
        try {
            // Create blob from chunks
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // Convert to WAV format (Yandex SpeechKit requires WAV)
            const wavBlob = await this.convertToWav(audioBlob);
            
            // Send to server
            const formData = new FormData();
            formData.append('audio', wavBlob, 'recording.wav');
            
            const response = await fetch('/api/voice-chat/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: wavBlob
            });
            
            if (!response.ok) {
                throw new Error('Failed to process voice message');
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Show transcription
                
                // Add messages to chat
                this.addMessageToChat(data.transcription, true);
                this.addMessageToChat(data.ai_response, false);
                
                // Play audio response
                await this.playAudioResponse(data.audio_base64);
                
                // Hide overlay after audio finishes
                setTimeout(() => {
                    this.hideOverlay();
                }, 1000);
            } else {
                throw new Error(data.error || 'Processing failed');
            }
            
        } catch (error) {
            console.error('Error processing recording:', error);
            this.showError('Я ничего не услышал 🐰');
            setTimeout(() => {
                this.hideOverlay();
            }, 2000);
        } finally {
            this.isProcessing = false;
        }
    }
    
    async convertToWav(blob) {
        // Convert webm to wav using Web Audio API
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create WAV file
        const wavBuffer = this.audioBufferToWav(audioBuffer);
        return new Blob([wavBuffer], { type: 'audio/wav' });
    }
    
    audioBufferToWav(buffer) {
        const length = buffer.length * buffer.numberOfChannels * 2 + 44;
        const arrayBuffer = new ArrayBuffer(length);
        const view = new DataView(arrayBuffer);
        const channels = [];
        let sample;
        let offset = 0;
        let pos = 0;
        
        // Write WAV header
        const setUint16 = (data) => {
            view.setUint16(pos, data, true);
            pos += 2;
        };
        
        const setUint32 = (data) => {
            view.setUint32(pos, data, true);
            pos += 4;
        };
        
        // RIFF identifier
        setUint32(0x46464952);
        // file length
        setUint32(length - 8);
        // RIFF type
        setUint32(0x45564157);
        // format chunk identifier
        setUint32(0x20746d66);
        // format chunk length
        setUint32(16);
        // sample format (raw)
        setUint16(1);
        // channel count
        setUint16(buffer.numberOfChannels);
        // sample rate
        setUint32(buffer.sampleRate);
        // byte rate (sample rate * block align)
        setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels);
        // block align (channel count * bytes per sample)
        setUint16(buffer.numberOfChannels * 2);
        // bits per sample
        setUint16(16);
        // data chunk identifier
        setUint32(0x61746164);
        // data chunk length
        setUint32(length - pos - 4);
        
        // Write interleaved data
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }
        
        while (pos < length) {
            for (let i = 0; i < buffer.numberOfChannels; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }
        
        return arrayBuffer;
    }
    
    setupAnalyser(stream) {
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;
        source.connect(this.analyser);
    }
    
    startVisualizer() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            if (!this.isRecording) return;
            
            requestAnimationFrame(draw);
            
            this.analyser.getByteFrequencyData(dataArray);
            
            // Clear canvas with gradient background
            const gradient = this.waveContext.createLinearGradient(0, 0, this.waveCanvas.width, 0);
            gradient.addColorStop(0, 'rgba(102, 126, 234, 0.1)');
            gradient.addColorStop(0.5, 'rgba(118, 75, 162, 0.1)');
            gradient.addColorStop(1, 'rgba(102, 126, 234, 0.1)');
            this.waveContext.fillStyle = gradient;
            this.waveContext.fillRect(0, 0, this.waveCanvas.width, this.waveCanvas.height);
            
            // Draw frequency bars with glow effect
            const barWidth = (this.waveCanvas.width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                barHeight = (dataArray[i] / 255) * this.waveCanvas.height * 0.8;
                
                // Gradient color based on frequency and amplitude
                const hue = (i / bufferLength) * 60 + 250; // Purple to blue
                const lightness = 50 + (dataArray[i] / 255) * 20;
                
                // Add glow effect
                this.waveContext.shadowBlur = 20;
                this.waveContext.shadowColor = `hsl(${hue}, 70%, ${lightness}%)`;
                
                // Draw bar
                const barGradient = this.waveContext.createLinearGradient(x, this.waveCanvas.height, x, this.waveCanvas.height - barHeight);
                barGradient.addColorStop(0, `hsla(${hue}, 70%, ${lightness}%, 0.8)`);
                barGradient.addColorStop(1, `hsla(${hue}, 70%, ${lightness}%, 0.2)`);
                
                this.waveContext.fillStyle = barGradient;
                this.waveContext.fillRect(
                    x,
                    (this.waveCanvas.height - barHeight) / 2,
                    barWidth - 2,
                    barHeight
                );
                
                x += barWidth + 1;
            }
            
            // Reset shadow
            this.waveContext.shadowBlur = 0;
        };
        
        draw();
    }
    
    startSilenceDetection() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let silenceStart = null;
        
        const checkSilence = () => {
            if (!this.isRecording) return;
            
            this.analyser.getByteFrequencyData(dataArray);
            
            // Calculate average volume
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;
            
            if (average < this.silenceThreshold) {
                // Silence detected
                if (!silenceStart) {
                    silenceStart = Date.now();
                } else if (Date.now() - silenceStart > this.silenceDelay) {
                    // Silence for too long, stop recording
                    this.stopRecording();
                    return;
                }
            } else {
                // Sound detected, reset silence timer
                silenceStart = null;
            }
            
            // Check again
            setTimeout(checkSilence, 100);
        };
        
        checkSilence();
    }
    
    showOverlay() {
        this.voiceOverlay.classList.add('active');
        
        // Animate in
        requestAnimationFrame(() => {
            this.voiceOverlay.style.opacity = '1';
        });
    }
    
    hideOverlay() {
        this.voiceOverlay.style.opacity = '0';
        
        setTimeout(() => {
            this.voiceOverlay.classList.remove('active');
        }, 300);
    }
    
    updateStatus(status) {
        const statusText = this.voiceOverlay.querySelector('.voice-status-text');
        const statusIcon = this.voiceOverlay.querySelector('.voice-recording-dot');
        
        switch (status) {
            case 'recording':
                statusText.textContent = 'Kronik слушает...';
                statusIcon.classList.add('recording');
                statusIcon.classList.remove('processing');
                break;
            case 'processing':
                statusText.textContent = 'Kronik обрабатывает...';
                statusIcon.classList.remove('recording');
                statusIcon.classList.add('processing');
                break;
            case 'playing':
                statusText.textContent = 'Kronik отвечает...';
                statusIcon.classList.remove('recording', 'processing');
                break;
        }
    }
    
    showError(message) {
        const statusText = this.voiceOverlay.querySelector('.voice-status-text');
        statusText.textContent = message;
        statusText.style.color = '#ff4757';
    }
    
    async playAudioResponse(audioHex) {
        this.updateStatus('playing');
        
        try {
            // Convert hex to bytes
            const bytes = new Uint8Array(audioHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const blob = new Blob([bytes], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(blob);
            
            const audio = new Audio(audioUrl);
            
            await new Promise((resolve, reject) => {
                audio.onended = resolve;
                audio.onerror = reject;
                audio.play();
            });
            
            URL.revokeObjectURL(audioUrl);
            
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    }
    
    addMessageToChat(content, isUser) {
        // Get chat messages container
        const messagesContainer = document.getElementById('ai-chat-messages');
        if (!messagesContainer) return;
        
        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = isUser ? 'user-message' : 'ai-message';
        
        let avatarHtml = '';
        if (isUser) {
            if (window.userAvatarUrl) {
                avatarHtml = `<div class="user-avatar"><img src="${window.userAvatarUrl}" alt="User" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;"></div>`;
            } else if (window.userInitial) {
                avatarHtml = `<div class="user-avatar">${window.userInitial}</div>`;
            } else {
                avatarHtml = `<div class="user-avatar">У</div>`;
            }
        } else {
            avatarHtml = `<div class="ai-avatar"><span class="kronik-logo">K</span></div>`;
        }
        
        messageDiv.innerHTML = `
            ${avatarHtml}
            <div class="message-content">
                <p>${this.escapeHtml(content)}</p>
            </div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Save to chat history
        if (window.ChatHistory) {
            window.ChatHistory.addMessage(content, isUser);
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    resizeCanvas() {
        if (!this.waveCanvas || !this.waveContainer) return;
        
        const rect = this.waveContainer.getBoundingClientRect();
        this.waveCanvas.width = rect.width;
        this.waveCanvas.height = rect.height;
    }
    
    getCsrfToken() {
        let token = null;
        
        const metaTag = document.querySelector('meta[name=csrf-token]');
        if (metaTag) {
            token = metaTag.getAttribute('content');
        }
        
        if (!token) {
            const hiddenInput = document.querySelector('[name=csrfmiddlewaretoken]');
            if (hiddenInput) {
                token = hiddenInput.value;
            }
        }
        
        if (!token) {
            token = this.getCookie('csrftoken');
        }
        
        return token;
    }
    
    getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
}

// Initialize voice interface when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if user is authenticated and AI chat is available
    if (window.userAuthenticated && document.getElementById('ai-chat-container')) {
        window.voiceInterface = new VoiceInterface();
    }
});