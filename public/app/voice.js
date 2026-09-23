// Record only while held. Late microphone permission cannot leave a stream running.
export class Recorder {
  constructor(changed, complete, failed) { Object.assign(this, { changed, complete, failed, generation: 0, active: false }); }
  async start() {
    if (this.active) return;
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) { this.failed(new Error('Recording needs Safari or Chrome with microphone permission. You can still read and practice aloud.')); return; }
    const generation = ++this.generation; this.active = true; this.changed('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!this.active || generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      this.recorder = recorder; const chunks = []; let bytes = 0; const started = performance.now();
      recorder.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes > 1900000) this.stop(); } };
      recorder.onerror = () => { this.cancel(); this.failed(new Error('Recording stopped unexpectedly. Please try again.')); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); clearTimeout(this.timer);
        if (generation !== this.generation) return;
        this.active = false; this.changed('idle');
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/mp4' });
        const duration = Math.min(45000, Math.round(performance.now() - started));
        if (blob.size < 128 || duration < 350) { this.failed(new Error('Hold the microphone while you say a short answer, then release.')); return; }
        if (blob.size > 2000000) { this.failed(new Error('That recording was too long. Try a shorter answer.')); return; }
        this.complete({ blob, duration });
      };
      recorder.start(250); this.changed('recording'); this.timer = setTimeout(() => this.stop(), 45000);
    } catch (error) {
      if (generation !== this.generation) return;
      this.cancel();
      this.failed(new Error(error?.name === 'NotAllowedError' ? 'Allow microphone access in your browser settings, then hold the button again.' : 'The microphone is unavailable. Close other recording apps and try again.'));
    }
  }
  stop() {
    if (!this.active) return;
    if (this.recorder?.state === 'recording') { this.active = false; this.recorder.stop(); clearTimeout(this.timer); }
    else this.cancel();
  }
  cancel() {
    ++this.generation; this.active = false; clearTimeout(this.timer);
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.stream?.getTracks().forEach(track => track.stop()); this.recorder = null; this.stream = null; this.changed('idle');
  }
}

export class Voice {
  constructor(status) { this.status = status; this.generation = 0; }
  unlock() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    this.context ??= new AudioContext();
    void this.context.resume().catch(() => {});
  }
  stop() {
    ++this.generation;
    try { this.source?.stop(); } catch { /* Playback may already have ended. */ }
    this.source = null; this.status('');
  }
  async play(load, slow = false) {
    this.stop(); const generation = this.generation; this.status('Preparing the voice…');
    try {
      if (!this.context) throw new Error('Tap Listen to hear Fala.');
      const bytes = await load();
      if (generation !== this.generation) return;
      const buffer = await this.context.decodeAudioData(bytes.slice(0));
      if (generation !== this.generation) return;
      if (this.context.state !== 'running') throw new Error('Tap Listen to hear Fala.');
      const source = this.context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = slow ? .7 : 1;
      source.connect(this.context.destination); this.source = source;
      source.onended = () => { if (generation === this.generation) this.status('Your turn. Hold the microphone when you’re ready.'); };
      source.start(); this.status('Listen to Fala…');
    } catch (error) { if (generation === this.generation) this.status(error.message || 'Tap Listen to try the voice again.'); }
  }
}
