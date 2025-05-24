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
        this.silenceDelay = 2500; // 2.5 seconds of silence
        
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
                <div class="voice-wave-container" id="voice-wave-container">
                    <canvas id="voice-wave-canvas"></canvas>
                </div>
                <div class="voice-status">
                    <div class="voice-status-icon">
                        <div class="voice-recording-dot"></div>
                    </div>
                    <div class="voice-status-text">Говорите...</div>
                </div>
                <div class="voice-transcription"></div>
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
                this.showTranscription(data.transcription);
                
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
            this.showError('Ошибка обработки записи');
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
            
            // Clear canvas
            this.waveContext.fillStyle = 'rgba(0, 0, 0, 0.1)';
            this.waveContext.fillRect(0, 0, this.waveCanvas.width, this.waveCanvas.height);
            
            // Draw frequency bars
            const barWidth = (this.waveCanvas.width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                barHeight = (dataArray[i] / 255) * this.waveCanvas.height * 0.8;
                
                // Gradient color based on frequency
                const hue = (i / bufferLength) * 120 + 200; // Blue to purple
                this.waveContext.fillStyle = `hsla(${hue}, 70%, 50%, 0.8)`;
                
                this.waveContext.fillRect(
                    x,
                    (this.waveCanvas.height - barHeight) / 2,
                    barWidth,
                    barHeight
                );
                
                x += barWidth + 1;
            }
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
            
            // Clear transcription
            const transcriptionEl = this.voiceOverlay.querySelector('.voice-transcription');
            if (transcriptionEl) {
                transcriptionEl.textContent = '';
            }
        }, 300);
    }
    
    updateStatus(status) {
        const statusText = this.voiceOverlay.querySelector('.voice-status-text');
        const statusIcon = this.voiceOverlay.querySelector('.voice-recording-dot');
        
        switch (status) {
            case 'recording':
                statusText.textContent = 'Говорите...';
                statusIcon.classList.add('recording');
                break;
            case 'processing':
                statusText.textContent = 'Обработка...';
                statusIcon.classList.remove('recording');
                statusIcon.classList.add('processing');
                break;
            case 'playing':
                statusText.textContent = 'Воспроизведение ответа...';
                statusIcon.classList.remove('recording', 'processing');
                break;
        }
    }
    
    showTranscription(text) {
        const transcriptionEl = this.voiceOverlay.querySelector('.voice-transcription');
        if (transcriptionEl) {
            transcriptionEl.textContent = text;
            transcriptionEl.classList.add('show');
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