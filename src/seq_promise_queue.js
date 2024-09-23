class SeqPromiseQueue {
  constructor() {
    this.queue = Promise.resolve();
  }

  add(promise) {
    this.queue = this.queue.then(() => promise()).catch((err) => {
      console.error('Error occurred:', err);
    });
    return this.queue;
  }
}

module.exports = SeqPromiseQueue