class SeqPromiseQueue {
  constructor() {
    this.queue = Promise.resolve();
  }

  add(promise, onDone) {
    if (onDone) {
      this.lastDoneCallback = onDone;
    }
    this.queue = this.queue
      .then(() => promise())
        .then(res => {
          onDone && onDone(res);
          return res;
        })
      .catch((err) => {
        // console.error(err);
      });
    return this.queue;
  }

  getQueue() {
    return this.queue;
  }
}

module.exports = SeqPromiseQueue