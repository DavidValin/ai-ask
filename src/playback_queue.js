class PlaybackQueue {
  constructor() {
    this.queue = [];
    this.hasStarted = false;
    this.isProcessing = false;
    this.lastResolveTime = 0;
    setInterval(
      () => {
        // force quit once playback stops for 1 sec
        if (this.hasStarted && this.isProcessing == false) {
          const timeSinceLastResolve = Date.now() - this.lastResolveTime;
          if (timeSinceLastResolve > 3000 && this.queue.length === 0) { // 1 second
            // NOTE: not working yet
            // process.exit(1);
          }
        }
      },
    100);
  }

  enqueue(promiseFunc) {
    this.queue.push(promiseFunc);
    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.hasStarted = true;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const promiseFunc = this.queue.shift();
      try {
        const result = await promiseFunc();
        // console.log('Promise resolved:', result);
        this.lastResolveTime = Date.now(); // update last resolve time
      } catch (error) {
        console.error('Error resolving promise:', error);
      }
    }

    

    this.isProcessing = false;
  }
}

module.exports = PlaybackQueue;
