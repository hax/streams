// NB: not executable, just for prototyping.

// Example usage:

var readableStream = getReadableStreamFromSomewhere();

readableStream.read(); // works
readableStream.state === 'readable'; // works
readableStream.ready.then(readMoreFromStream); // works

var reader = readableStream.getExclusiveReader();

readableStream.read(); // throws "the stream is locked" error
readableStream.state; // throws---or always returns "waiting"?
readableStream.ready; // throws---or returns a promise fulfilled when the stream becomes both unlocked and readable?

reader.read(); // works
reader.state === 'readable'; // works
reader.ready.then(readMoreFromReader); // works

// should these work? currently they are undefined
reader.closed.then(onClosed, onErrored);
reader.pipeTo(dest); // should be unnecessary since readableStream.pipeTo(dest) automatically locks

readableStream.getExclusiveReader(); // throws; only one exclusive reader at a time

reader.release();

readableStream.read(); // works again; same for the others

reader.read(); // throws; lock has been released.

// To illustrate how piping auto-locks:

readableStream.pipeTo(dest);
readableStream.read(); // throws, same as with a manual lock
readableStream.state; // throws (or returns "waiting", see above)
readableStream.ready; // throws (or returns ... see above)

// This piping auto-locking is important so that if you pipe e.g. two file descriptors together the implementation can
// hook them together directly, off-thread, without the JS thread being able to interfere or observe. That is the main
// goal.

// We could also accomplish this in an ad-hoc way by adding a tiny bit of magic to pipeTo, so that it's no longer
// using purely public APIs.

class ExclusiveStreamReader {
  constructor(stream, token, { getToken, setToken }) {
    this._stream = stream;
    this._token = token;
    this._getToken = getToken;
    this._setToken = setToken;
    // Check types? Or fail later? Meh.
  }

  get ready() {
    if (this._getToken() !== this._token) {
      throw new TypeError("This stream reader has released its lock on the original stream and can no " +
                          "longer be used");
    }

    this._setToken(undefined);
    try {
      return this._stream.ready;
    } finally {
      this._setToken(this._token);
    }
  }

  get state() {
    if (this._getToken() !== this._token) {
      throw new TypeError("This stream reader has released its lock on the original stream and can no " +
                          "longer be used");
    }

    this._setToken(undefined);
    try {
      return this._stream.state;
    } finally {
      this._setToken(this._token);
    }
  }

  read(...args) {
    if (this._getToken() !== this._token) {
      throw new TypeError("This stream reader has released its lock on the original stream and can no " +
                          "longer be used");
    }

    this._setToken(undefined);
    try {
      return this._stream.read(...args);
    } finally {
      this._setToken(this._token);
    }
  }

  release() {
    this._setToken(undefined);
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

    return new ExclusiveStreamReader(this, this._exclusiveReaderToken, {
      getToken: () => this._exclusiveReaderToken,
      setToken: token => this._exclusiveReaderToken = token
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
    // Original algorithm goes here
  }
}
