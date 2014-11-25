// NB: not executable, just for prototyping.

class ExclusiveStreamReader {
  constructor(token, { read, getReady, getState, releaseLock }) {
    this._token = token;
    this._read = read;
    this._getReady = getReady;
    this._getState = getState;
    this._releaseLock = releaseLock;

    // Check types? Or fail later? Meh.
  }

  get ready() {
    return this._getReady(this._token);
  }

  get state() {
    return this._getState(this._token);
  }

  read(...args) {
    return this._read(token, ...args);
  }

  release() {
    return this._releaseLock(token);
  }
}

class ReadableStream {
  ...
  constructor(...) {
    this._exclusiveReaderToken = undefined;
  }

  getExclusiveReader() {
    if (this._exclusiveReaderToken !== undefined) {
      throw new TypeError("This stream has already been locked for exclusive reading by another reader.");
    }

    this._exclusiveReaderToken = {};

    return new ExclusiveStreamReader(this._exclusiveReaderToken, {
      read: token => {
        if (this._exclusiveReaderToken !== token) {
          throw new TypeError("This stream reader has released its lock on the original stream and can no " +
            "longer be used");
        }

        return ReadFromReadableStream(this);
      },
      getReady: token => {
        if (this._exclusiveReaderToken !== token) {
          throw new TypeError("This stream reader has released its lock on the original stream and can no " +
            "longer be used");
        }

        return this._readyPromise;
      },
      getState: token => {
        if (this._exclusiveReaderToken !== token) {
          throw new TypeError("This stream reader has released its lock on the original stream and can no " +
            "longer be used");
        }

        return this._state;
      },
      releaseLock: token => {
        if (this._exclusiveReaderToken !== token) {
          throw new TypeError("This stream reader has released its lock on the original stream and can no " +
            "longer be used");
        }

        this._exclusiveReaderToken = undefined;
      }
    });
  }

  pipeTo(dest, { preventClose, preventAbort, preventCancel } = {}) {
    const reader = this.getExclusiveReader();

    // use reader.read(), reader.ready, reader.state, but this.closed? Or should we add closed too?

    // every place that currently does rejectPipeToPromise or resolvePipeToPromise should also do reader.release().
  }

  get ready() {
    if (this._exclusiveReaderToken !== undefined) {
      throw new TypeError("This stream is locked to a single exclusive reader and cannot be used directly.");
    }
    return this._readyPromise;
  }

  get state() {
    if (this._exclusiveReaderToken !== undefined) {
      throw new TypeError("This stream is locked to a single exclusive reader and cannot be used directly.");
    }
    return this._state;
  }

  read() {
    if (this._exclusiveReaderToken !== undefined) {
      throw new TypeError("This stream is locked to a single exclusive reader and cannot be used directly.");
    }

    return ReadFromReadableStream(this);
  }
}
